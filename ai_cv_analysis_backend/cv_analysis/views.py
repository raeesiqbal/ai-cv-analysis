from django.shortcuts import render
import openai
import requests
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from .models import CV, CVAnalysisResult, Interview, InterviewQuestion
from .serializers import InterviewSerializer, InterviewQuestionSerializer
from django.shortcuts import get_object_or_404
from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated


# Create your views here.
import logging
from rest_framework import status, permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import CV, CVAnalysisResult
from .serializers import (
    CVCreateSerializer,
    CVListSerializer,
    CVDetailSerializer,
    CVUpdateSerializer,
    CVAnalysisResultSerializer,
)
from .openai_service import analyze_cv as openai_analyze_cv
from django.db import IntegrityError


class CVViewSet(viewsets.ModelViewSet):
    """ViewSet for CV model.

    - List and create are scoped to the authenticated user.
    - `create` will set `user` automatically via perform_create.
    - POST to the `analyze` action will create a CVAnalysisResult for the CV.
    - GET to the `analysis` action will return the analysis for the CV.
    """

    queryset = CV.objects.all()
    # default serializer (will be overridden by get_serializer_class)
    serializer_class = CVDetailSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # During schema generation (drf-yasg) `self.request.user` may be
        # an AnonymousUser which causes queries like `filter(user=...)`
        # to raise TypeError. Short-circuit in that case and when the
        # request is unauthenticated by returning an empty queryset.
        if getattr(self, 'swagger_fake_view', False):
            return CV.objects.none()

        user = getattr(self.request, 'user', None)
        if user is None or not getattr(user, 'is_authenticated', False):
            return CV.objects.none()

        # ensure users only see their own CVs
        return CV.objects.filter(user=user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def create(self, request, *args, **kwargs):
        """Override create to return file URL and ID of the created CV."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        
        cv = serializer.instance
        file_url = cv.file.url if cv.file else None
        
        response_data = {
            'id': cv.id,
            'file_url': file_url,
        }
        
        return Response(response_data, status=status.HTTP_201_CREATED)

    def get_serializer_class(self):
        # return different serializers depending on the action
        if self.action == 'create':
            return CVCreateSerializer
        if self.action in ['update', 'partial_update']:
            return CVUpdateSerializer
        if self.action == 'list':
            return CVListSerializer
        if self.action == 'retrieve':
            return CVDetailSerializer
        # fallback
        return super().get_serializer_class()

    @action(detail=True, methods=['post'], url_path='analyze')
    def analyze(self, request, pk=None):
        """Run (mock) AI analysis against the CV and create a CVAnalysisResult.

        Replace mock logic with a real AI integration later.
        """
        try:
            cv = CV.objects.get(pk=pk, user=request.user)
        except CV.DoesNotExist:
            return Response({'error': 'CV not found'}, status=status.HTTP_404_NOT_FOUND)

        # If an analysis already exists, return it unless the caller forces a
        # re-run by passing ?force=true. This prevents UNIQUE constraint errors
        # when someone calls analyze repeatedly for the same CV.
        force = request.query_params.get('force') in ['1', 'true', 'True']

        existing = CVAnalysisResult.objects.filter(cv=cv).first()
        if existing and not force:
            serializer = CVAnalysisResultSerializer(existing)
            return Response(serializer.data, status=status.HTTP_200_OK)

        # Use OpenAI to analyze the CV. If OpenAI is not configured or fails,
        # fall back to the original mock analysis.
        try:
            analysis_data = openai_analyze_cv(cv)
        except Exception as exc:
            # Print to console and log. Do NOT use hardcoded fallback or create any DB records.
            error_message = str(exc)
            print('OpenAI analysis failed:', error_message)
            logger = logging.getLogger(__name__)
            logger.exception('OpenAI analysis failed: %s', exc)
            return Response({
                'error': 'Failed to analyze CV',
                'detail': f'AI service error: {error_message}',
                'cv_id': cv.id
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        # Validate the analysis_data shape before creating a DB record. If the
        # AI returned invalid data, print/log and return an error without
        # creating any CVAnalysisResult.
        if not isinstance(analysis_data, dict):
            print('OpenAI returned invalid analysis_data:', analysis_data)
            logging.getLogger(__name__).error('OpenAI returned non-dict analysis_data: %r', analysis_data)
            return Response({'error': 'Invalid analysis response from AI'}, status=status.HTTP_502_BAD_GATEWAY)

        required_keys = {'skills', 'summary', 'experience_level', 'ai_score', 'suggestions'}
        if not required_keys.issubset(set(analysis_data.keys())):
            print('OpenAI returned incomplete analysis_data:', analysis_data)
            logging.getLogger(__name__).error('OpenAI returned incomplete analysis_data: %r', analysis_data)
            return Response({'error': 'Incomplete analysis response from AI'}, status=status.HTTP_502_BAD_GATEWAY)

        # If forcing a re-run, remove the existing result first. Note this
        # does not prevent a race where another process re-creates a result
        # between our delete and create; we handle that with IntegrityError
        # below by returning the existing row.
        if existing and force:
            try:
                existing.delete()
            except Exception:
                # deletion failed for some reason; continue and attempt create
                pass

        try:
            analysis = CVAnalysisResult.objects.create(
                cv=cv,
                summary=analysis_data.get('summary'),
                skills_extracted=analysis_data.get('skills', []),
                experience_level=analysis_data.get('experience_level'),
                ai_score=analysis_data.get('ai_score'),
                suggestions=analysis_data.get('suggestions')
            )

            serializer = CVAnalysisResultSerializer(analysis)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except IntegrityError:
            # Another request created the analysis concurrently. Return the
            # existing analysis instead of failing with a 500.
            try:
                analysis = CVAnalysisResult.objects.get(cv=cv)
                serializer = CVAnalysisResultSerializer(analysis)
                return Response(serializer.data, status=status.HTTP_200_OK)
            except CVAnalysisResult.DoesNotExist:
                # Extremely unlikely: the insert failed and no row exists.
                return Response({'error': 'Could not create analysis'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['get'], url_path='analysis')
    def analysis(self, request, pk=None):
        """Return the analysis for this CV (if any)."""
        try:
            analysis = CVAnalysisResult.objects.get(cv__id=pk, cv__user=request.user)
            serializer = CVAnalysisResultSerializer(analysis)
            return Response(serializer.data)
        except CVAnalysisResult.DoesNotExist:
            return Response({'error': 'Analysis not found'}, status=status.HTTP_404_NOT_FOUND)


class CVAnalysisResultViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only access to CVAnalysisResult objects for the authenticated user."""

    queryset = CVAnalysisResult.objects.all()
    serializer_class = CVAnalysisResultSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Short-circuit during schema generation or when unauthenticated to
        # avoid trying to filter by AnonymousUser (which raises TypeError).
        if getattr(self, 'swagger_fake_view', False):
            return CVAnalysisResult.objects.none()

        user = getattr(self.request, 'user', None)
        if user is None or not getattr(user, 'is_authenticated', False):
            return CVAnalysisResult.objects.none()

        # restrict to analysis for CVs owned by the requesting user
        return CVAnalysisResult.objects.filter(cv__user=user)


import os
import json
from .openai_service import analyze_cv as openai_analyze_cv

logger = logging.getLogger(__name__)


class InterviewViewSet(viewsets.ViewSet):
    """ViewSet for Interview management.
    
    - `start` action: Creates a new interview with AI-generated questions based on CV analysis
    - `list` action: Returns all interviews for the authenticated user
    - `retrieve` action: Returns a specific interview with its questions
    - `destroy` action: Deletes a specific interview (DELETE method)
    - `submit_answer` action: Submits an answer to a question and updates scoring
    - `save_progress` action: Saves current question index for resume functionality
    """
    
    permission_classes = [permissions.IsAuthenticated]

    def list(self, request):
        """Return all interviews for the authenticated user."""
        interviews = Interview.objects.filter(cv__user=request.user)
        serializer = InterviewSerializer(interviews, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def retrieve(self, request, pk=None):
        """Return a specific interview with its questions."""
        try:
            interview = Interview.objects.get(pk=pk, cv__user=request.user)
            serializer = InterviewSerializer(interview)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Interview.DoesNotExist:
            return Response({'error': 'Interview not found'}, status=status.HTTP_404_NOT_FOUND)

    def destroy(self, request, pk=None):
        """Delete a specific interview."""
        try:
            interview = Interview.objects.get(pk=pk, cv__user=request.user)
            interview_id = interview.id
            interview.delete()
            return Response(
                {'message': f'Interview {interview_id} deleted successfully'},
                status=status.HTTP_204_NO_CONTENT
            )
        except Interview.DoesNotExist:
            return Response({'error': 'Interview not found'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=False, methods=['post'], url_path='start')
    def start(self, request):
        """Start a new interview for a given CV.
        
        Expects: { "cv_id": <int> }
        Generates 5 multiple-choice questions using OpenAI based on CV analysis.
        """
        cv_id = request.data.get('cv_id')
        if not cv_id:
            return Response({'error': 'cv_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            cv = CV.objects.get(pk=cv_id, user=request.user)
        except CV.DoesNotExist:
            return Response({'error': 'CV not found'}, status=status.HTTP_404_NOT_FOUND)

        # Check if CV has been analyzed
        try:
            analysis = cv.analysis
        except CVAnalysisResult.DoesNotExist:
            return Response(
                {'error': 'CV has not been analyzed yet. Please analyze the CV first.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Create interview object
        interview = Interview.objects.create(cv=cv)

        # Prepare prompt for OpenAI
        prompt = f"""
You are a professional interviewer preparing a candidate for a real technical or professional job interview.

The candidate’s background and skillset are summarized below. Use this information only to understand their **role, domain, and expertise level** — do NOT ask questions about their CV, summary, or skills list directly.

Candidate Profile:
Summary: {analysis.summary}
Skills: {', '.join(analysis.skills_extracted)}
Experience Level: {analysis.experience_level}
Suggestions: {analysis.suggestions}

Your task:
Generate **10 realistic multiple-choice interview questions** that the candidate might face in an actual interview for a position that matches their background.

Guidelines:
- Questions must evaluate **real job-relevant knowledge** or **problem-solving ability**, not what’s written in the CV.
- Use **scenario-based, conceptual, and practical** questions related to their field.
- Adapt question difficulty to their experience level (junior/mid/senior).
- Each question should sound like it could come from a **real interviewer**.
- Avoid any reference to the CV, résumé, skills list, or candidate summary in the question text.
- Keep questions short, professional, and natural.

Formatting:
Return ONLY valid JSON in this exact structure (no markdown, no commentary):

[
  {{
    "question": "Question text here",
    "choices": {{
      "A": "Option A",
      "B": "Option B",
      "C": "Option C",
      "D": "Option D"
    }},
    "correct": "A"
  }},
  ...
]
"""
        try:
            # Use requests to call OpenAI API
            api_key = getattr(settings, 'OPENAI_API_KEY', None) or os.getenv('OPENAI_API_KEY')
            if not api_key:
                raise RuntimeError('OPENAI_API_KEY not configured')

            model = getattr(settings, 'OPENAI_MODEL', None) or os.getenv('OPENAI_MODEL', 'gpt-3.5-turbo')
            api_url = getattr(settings, 'OPENAI_API_URL', None) or os.getenv('OPENAI_API_URL', 'https://api.openai.com/v1/chat/completions')
            timeout = int(getattr(settings, 'OPENAI_TIMEOUT', None) or os.getenv('OPENAI_TIMEOUT', '30'))

            headers = {
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json',
            }

            payload = {
                'model': model,
                'messages': [
                    {'role': 'system', 'content': 'You are a professional technical interviewer. Always respond with valid JSON only.'},
                    {'role': 'user', 'content': prompt},
                ],
                'temperature': 0.7,
                'max_tokens': 2000,
            }

            resp = requests.post(api_url, headers=headers, json=payload, timeout=timeout)

            if resp.status_code != 200:
                logger.error('OpenAI API error %s: %s', resp.status_code, resp.text)
                return Response({'error': 'Failed to generate interview questions'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

            data = resp.json()
            response_text = data['choices'][0]['message']['content']

            # Extract and parse JSON
            try:
                questions_data = json.loads(response_text)
            except json.JSONDecodeError:
                logger.error('Failed to parse JSON from OpenAI response: %s', response_text)
                return Response({'error': 'Invalid AI response format'}, status=status.HTTP_502_BAD_GATEWAY)

            if not isinstance(questions_data, list) or len(questions_data) == 0:
                return Response({'error': 'AI did not generate any questions'}, status=status.HTTP_502_BAD_GATEWAY)

            # Save questions to DB
            for q in questions_data:
                try:
                    InterviewQuestion.objects.create(
                        interview=interview,
                        question_text=q.get('question', ''),
                        choice_1=q.get('choices', {}).get('A', ''),
                        choice_2=q.get('choices', {}).get('B', ''),
                        choice_3=q.get('choices', {}).get('C', ''),
                        choice_4=q.get('choices', {}).get('D', ''),
                        correct_answer=q.get('correct', ''),
                    )
                except Exception as e:
                    logger.warning('Failed to save interview question: %s', e)

            interview.total_questions = len(questions_data)
            interview.save()

            serializer = InterviewSerializer(interview)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        except Exception as exc:
            logger.exception('Failed to generate interview questions: %s', exc)
            interview.delete()
            return Response(
                {'error': 'Failed to generate interview questions'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

    @action(detail=True, methods=['post'], url_path='submit-answer')
    def submit_answer(self, request, pk=None):
        """Submit an answer to an interview question.
        
        Expects: { "question_id": <int>, "user_answer": "A" }
        Updates the question with the user's answer and recalculates the interview score.
        """
        try:
            interview = Interview.objects.get(pk=pk, cv__user=request.user)
        except Interview.DoesNotExist:
            return Response({'error': 'Interview not found'}, status=status.HTTP_404_NOT_FOUND)

        question_id = request.data.get('question_id')
        user_answer = request.data.get('user_answer')

        if not question_id or not user_answer:
            return Response(
                {'error': 'question_id and user_answer are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            question = InterviewQuestion.objects.get(pk=question_id, interview=interview)
        except InterviewQuestion.DoesNotExist:
            return Response({'error': 'Question not found'}, status=status.HTTP_404_NOT_FOUND)

        # Save the user's answer
        question.user_answer = user_answer
        question.save()

        # Recalculate interview score
        all_questions = interview.questions.all()
        correct_count = sum(1 for q in all_questions if q.user_answer and q.user_answer == q.correct_answer)
        
        interview.correct_answers = correct_count
        interview.score = (correct_count / interview.total_questions * 100) if interview.total_questions > 0 else 0.0
        
        # Mark as completed if all questions answered
        if all_questions.filter(user_answer__isnull=True).count() == 0:
            interview.completed = True
        
        interview.save()

        serializer = InterviewSerializer(interview)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='save-progress')
    def save_progress(self, request, pk=None):
        """Save the current question index to resume later.
        
        Expects: { "current_question_index": <int> }
        Stores the progress so user can resume from this question.
        """
        try:
            interview = Interview.objects.get(pk=pk, cv__user=request.user)
        except Interview.DoesNotExist:
            return Response({'error': 'Interview not found'}, status=status.HTTP_404_NOT_FOUND)

        current_index = request.data.get('current_question_index')
        if current_index is None:
            return Response(
                {'error': 'current_question_index is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            current_index = int(current_index)
            if current_index < 0 or current_index >= interview.total_questions:
                raise ValueError('Index out of range')
        except (ValueError, TypeError):
            return Response(
                {'error': 'current_question_index must be a valid integer'},
                status=status.HTTP_400_BAD_REQUEST
            )

        interview.current_question_index = current_index
        interview.save()

        return Response({
            'message': 'Progress saved',
            'interview_id': interview.id,
            'current_question_index': interview.current_question_index
        }, status=status.HTTP_200_OK)



# views.py
