import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import Alert from "../components/Alert";
import { getInterviewsForCV } from "../components/api/interview";
import BackButton from "../components/BackButton";
import JobMap from "../components/JobMap";

const baseURL = import.meta.env.VITE_API_BASE_URL;

export default function CVAnalysis() {
  const { cvId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [analysis, setAnalysis] = useState(location.state?.analysis || null);
  const [loading, setLoading] = useState(!analysis);
  const [alert, setAlert] = useState(null);

  const [interviews, setInterviews] = useState([]);
  const [loadingInterviews, setLoadingInterviews] = useState(false);

  // Fetch CV analysis (polling)
  useEffect(() => {
    if (analysis) {
      setLoading(false);
      return;
    }

    const token = localStorage.getItem("accessToken");
    if (!token) {
      setAlert({
        type: "error",
        title: "Unauthorized",
        message: "Please log in to view CV analysis.",
      });
      setLoading(false);
      return;
    }

    let pollingInterval = null;
    let initialFetchDone = false;

    const fetchAnalysis = async () => {
      try {
        const response = await axios.get(
          `${baseURL}/api/cv/cvs/${cvId}/analysis/`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (response.data && response.data.summary) {
          setAnalysis(response.data);
          setLoading(false);
          if (pollingInterval) {
            clearInterval(pollingInterval);
          }
        }
      } catch (error) {
        // Only log non-404 errors (404 is expected while analysis is processing)
        if (error.response?.status !== 404) {
          console.error("Error fetching analysis:", error);
        }
        
        // If first fetch and we get 404, analysis hasn't been created yet
        if (!initialFetchDone) {
          initialFetchDone = true;
          setLoading(false);
        }
      }
    };

    // Add initial delay to give the POST request time to complete
    const startPolling = () => {
      fetchAnalysis();
      pollingInterval = setInterval(fetchAnalysis, 5000); // Poll every 5 seconds
    };

    // Wait 1 second before starting to poll
    const initialTimeout = setTimeout(startPolling, 1000);

    return () => {
      clearTimeout(initialTimeout);
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [cvId, analysis]);

  // Fetch interviews history
  useEffect(() => {
    const fetchInterviews = async () => {
      try {
        setLoadingInterviews(true);
        const data = await getInterviewsForCV(cvId);
        setInterviews(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error(error);
        setInterviews([]);
      } finally {
        setLoadingInterviews(false);
      }
    };

    if (cvId) fetchInterviews();
  }, [cvId]);

  if (loading)
    return <p className="text-center mt-20">Loading CV analysis...</p>;

  const handleRetryAnalysis = async () => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setAlert({
        type: "error",
        title: "Unauthorized",
        message: "Please log in to retry analysis.",
      });
      return;
    }

    setLoading(true);
    setAlert(null);

    try {
      const response = await axios.post(
        `${baseURL}/api/cv/cvs/${cvId}/analyze/`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data) {
        setAnalysis(response.data);
        setAlert({
          type: "success",
          title: "Success",
          message: "✅ CV analyzed successfully!",
        });
      }
    } catch (error) {
      console.error("Retry analysis error:", error);
      setAlert({
        type: "error",
        title: "Analysis Failed",
        message: `❌ ${error.response?.data?.detail || "Failed to analyze CV. Please try again later."}`,
      });
    } finally {
      setLoading(false);
    }
  };

  if (!analysis)
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-r from-indigo-50 to-pink-50">
        <div className="bg-white p-8 rounded-2xl shadow-lg text-center max-w-md">
          {alert && (
            <div className="mb-4">
              <Alert
                type={alert.type}
                title={alert.title}
                message={alert.message}
                onClose={() => setAlert(null)}
              />
            </div>
          )}
          <p className="text-gray-600 mb-6">
            ⚠️ This CV has not been analyzed yet.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={handleRetryAnalysis}
              disabled={loading}
              className={`bg-green-600 text-white py-2 px-6 rounded-full hover:bg-green-700 transition ${
                loading ? "opacity-60 cursor-not-allowed" : ""
              }`}
            >
              {loading ? "Analyzing..." : "🔄 Retry Analysis"}
            </button>
            <button
              onClick={() => navigate("/my-cvs")}
              className="bg-[#050E7F] text-white py-2 px-6 rounded-full hover:bg-indigo-700 transition"
            >
              Back to My CVs
            </button>
          </div>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-gradient-to-r from-indigo-50 via-white to-pink-50 relative">
      <BackButton to="/my-cvs" title="Back to my CVs" />

      <div className="flex h-full flex-col lg:flex-row">
        {/* Sidebar */}
        <aside className="lg:w-80 w-full bg-white border-b lg:border-b-0 lg:border-r border-gray-200 shadow-lg overflow-y-auto max-h-96 lg:max-h-screen">
          <div className="p-6">
            <h2 className="text-xl font-bold mb-4">Interview History</h2>

            {loadingInterviews ? (
              <div className="text-center py-10">
                <div className="w-6 h-6 border-4 border-[#050E7F] border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-sm text-gray-600">Loading interviews...</p>
              </div>
            ) : interviews.length === 0 ? (
              <div className="text-center py-10 bg-gray-50 rounded-xl shadow-inner">
                <p className="text-sm text-gray-600 mb-3">
                  You haven’t started any interviews yet.
                </p>
                <button
                  onClick={() =>
                    navigate("/start-interview", {
                      state: { selectedCvId: parseInt(cvId) },
                    })
                  }
                  className="text-xs bg-[#050E7F] text-white px-4 py-2 rounded-full hover:bg-indigo-700 transition"
                >
                  Start Interview
                </button>
              </div>
            ) : (
              <ul className="space-y-3">
                {interviews.map((interview) => (
                  <li
                    key={interview.id}
                    onClick={() => navigate(`/interview/${interview.id}`)}
                    className="group cursor-pointer p-4 bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-[#050E7F] rounded-xl transition-all"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-800 text-sm group-hover:text-[#050E7F] transition">
                          {interview.cv_name || `Interview #${interview.id}`}
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">
                          {interview.started_at
                            ? new Date(interview.started_at).toLocaleString()
                            : "Not started"}
                        </p>
                        {interview.score != null && (
                          <p className="text-xs font-semibold text-indigo-700 mt-1">
                            Score: {Math.round(interview.score)}%
                          </p>
                        )}
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-semibold ${
                          interview.completed
                            ? "bg-green-100 text-green-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {interview.completed ? "✓" : "⏳"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-10">
          <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-2xl p-6 sm:p-8 lg:p-12">
            <div className="flex justify-between items-center mb-8">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold">
                CV Analysis Summary
              </h1>
            </div>

            {alert && <Alert {...alert} onClose={() => setAlert(null)} />}

            <section className="mb-10">
              <h2 className="text-lg sm:text-xl font-semibold mb-3">
                Overview
              </h2>
              <p className="text-gray-700 leading-relaxed text-sm sm:text-base">
                {analysis.summary}
              </p>
            </section>

            <div className="flex flex-col sm:flex-row gap-4 mb-10">
              <button
                onClick={() =>
                  navigate("/start-interview", {
                    state: { selectedCvId: parseInt(cvId) },
                  })
                }
                className="w-full sm:w-auto bg-[#050E7F] text-white py-2 px-8 rounded-full hover:bg-indigo-700 transition font-medium"
              >
                Start Interview
              </button>
            </div>

            <section className="mb-10 mt-10">
              <h2 className="text-lg sm:text-xl font-semibold mb-4">
                Extracted Skills
              </h2>
              <div className="flex flex-wrap gap-2">
                {analysis.skills_extracted?.map((skill, i) => (
                  <span
                    key={i}
                    className="bg-[#050E7F] text-white text-xs sm:text-sm px-3 py-1 rounded-full shadow-sm"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </section>

            <section className="grid sm:grid-cols-2 gap-6 mb-10">
              <div className="p-5 border rounded-xl shadow-sm bg-gray-50">
                <h3 className="font-semibold text-sm sm:text-base mb-1">
                  Experience Level
                </h3>
                <p className="text-gray-800 text-sm sm:text-base">
                  {analysis.experience_level}
                </p>
              </div>

              <div className="p-5 border rounded-xl shadow-sm bg-gray-50">
                <h3 className="font-semibold text-sm sm:text-base mb-1">
                  AI Score
                </h3>
                <p className="text-gray-800 font-medium text-base sm:text-lg">
                  {analysis.ai_score} / 100
                </p>
              </div>
            </section>

            <section className="mb-10">
              <h2 className="text-lg sm:text-xl font-semibold mb-4">
                Suggestions for Improvement
              </h2>
              <div className="p-6 rounded-xl border bg-gray-50 shadow-sm space-y-4 leading-relaxed text-sm sm:text-base">
                {analysis.suggestions
                  ?.split(/\d\.\s/)
                  .filter(Boolean)
                  .map((point, i) => {
                    const [title, ...descParts] = point.split(":");
                    return (
                      <p key={i}>
                        <strong>{title.trim()}:</strong>{" "}
                        {descParts.join(":").trim()}
                      </p>
                    );
                  })}
              </div>
            </section>

            <section className="mb-10">
              <h2 className="text-lg sm:text-xl font-semibold mb-4">
                🗺️ Find Nearby Companies
              </h2>
              <p className="text-gray-600 text-sm mb-4">
                Discover software houses and tech companies near you where you can apply for jobs.
              </p>
              <JobMap 
                onShowSoftwareHouses={(count) => {
                  setAlert({
                    type: "success",
                    title: "Companies Found",
                    message: `Found ${count} software houses nearby!`,
                  });
                }}
              />
            </section>

            <footer className="text-xs sm:text-sm mt-10 border-t pt-4">
              <p>
                <strong>Analyzed At:</strong>{" "}
                {new Date(analysis.analyzed_at).toLocaleString()}
              </p>
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
