import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Alert from "../components/Alert";
import BackButton from "../components/BackButton";

const baseURL = import.meta.env.VITE_API_BASE_URL;

export default function UploadCVPage() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [alert, setAlert] = useState(null);
  const navigate = useNavigate();

  const handleFileSelect = (event) => {
    setSelectedFile(event.target.files[0]);
    setAlert(null);
  };

  const handleCVSubmit = async () => {
    if (!selectedFile) {
      setAlert({
        type: "warning",
        title: "No File Selected",
        message: "⚠️ Please choose a CV file before uploading.",
      });
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);

    const token = localStorage.getItem("accessToken");
    if (!token) {
      setAlert({
        type: "error",
        title: "Unauthorized",
        message: "❌ You must be logged in to upload your CV.",
      });
      return;
    }

    try {
      setIsProcessing(true);
      setAlert({
        type: "info",
        title: "Uploading",
        message: "⏳ Uploading your CV, please wait...",
      });

      // Upload CV
      const uploadResponse = await axios.post(
        `${baseURL}/api/cv/cvs/`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            Authorization: `Bearer ${token}`,
          },
          onUploadProgress: (event) => {
            const percent = Math.round((event.loaded * 100) / event.total);
            setUploadProgress(percent);
          },
        }
      );

      if (uploadResponse.status === 201) {
        const newCvId = uploadResponse.data.id;

        // Show upload success message
        setAlert({
          type: "success",
          title: "Upload Successful",
          message: `✅ CV uploaded successfully! Starting AI analysis...`,
        });

        // Wait a moment before triggering analysis to ensure upload is complete
        await new Promise(resolve => setTimeout(resolve, 500));

        // Trigger analysis
        try {
          setAlert({
            type: "info",
            title: "Analyzing",
            message: "🤖 AI is analyzing your CV, please wait...",
          });

          const analysisResponse = await axios.post(
            `${baseURL}/api/cv/cvs/${newCvId}/analyze/`,
            {},
            { headers: { Authorization: `Bearer ${token}` } }
          );

          // Check if analysis was successful
          if (analysisResponse.status === 201 && analysisResponse.data) {
            setAlert({
              type: "success",
              title: "Analysis Complete",
              message: "✅ CV analyzed successfully! Redirecting...",
            });

            // Wait a moment to show the success message
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Navigate to analysis page with the analysis data
            navigate(`/cv-analysis/${newCvId}`, {
              state: { analysis: analysisResponse.data },
            });
          }
        } catch (analyzeError) {
          console.error("Analysis error:", analyzeError);
          
          // Check if it's a 503 Service Unavailable error
          if (analyzeError.response?.status === 503) {
            setAlert({
              type: "error",
              title: "Analysis Failed",
              message: `❌ ${analyzeError.response?.data?.detail || "AI service is temporarily unavailable. Please try analyzing your CV again later."}`,
            });
            // Don't navigate - stay on upload page so user can try again
            return;
          }
          
          // For other errors (e.g., network timeout), navigate and let page poll
          setAlert({
            type: "warning",
            title: "Analysis In Progress",
            message: "⏳ Analysis is taking longer than expected. Redirecting to analysis page...",
          });
          
          // Wait before navigating
          await new Promise(resolve => setTimeout(resolve, 1500));
          navigate(`/cv-analysis/${newCvId}`);
        }
      }
    } catch (uploadError) {
      console.error("Upload error:", uploadError);
      setAlert({
        type: "error",
        title: "Upload Failed",
        message:
          "❌ Could not upload your CV. Please check your internet connection or try again.",
      });
    } finally {
      setIsProcessing(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-r from-white via-pink-50 to-indigo-50 px-4 py-12">
      <BackButton to="/" title="Back to Home" />
      <div className="w-full max-w-2xl">
        <h1 className="text-3xl sm:text-4xl font-bold text-center text-gray-900 mb-4">
          Upload & Analyze Your CV
        </h1>

        <ul className="mb-6 text-gray-700 px-4 sm:px-0 space-y-2 list-disc list-inside">
          <li>
            <strong>Step 1:</strong> Upload your CV file (.pdf, .doc, .docx).
          </li>
          <li>
            <strong>Step 2:</strong> Our AI will analyze your CV for skills,
            experience, and suggestions.
          </li>
          <li>
            <strong>Step 3:</strong> You will receive a detailed report with
            insights and recommendations.
          </li>
        </ul>

        <div className="bg-white shadow-2xl rounded-2xl p-8 sm:p-10 flex flex-col items-center w-full">
          {alert && (
            <div className="w-full mb-6">
              <Alert
                type={alert.type}
                title={alert.title}
                message={alert.message}
                onClose={() => setAlert(null)}
              />
            </div>
          )}

          <div className="w-full border-2 border-dashed border-indigo-400 rounded-lg p-6 mb-6 bg-gray-100 hover:bg-indigo-50 transition">
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={handleFileSelect}
              className="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#050E7F] file:text-white hover:file:bg-indigo-700 cursor-pointer"
            />
          </div>

          {isProcessing && (
            <div className="w-full bg-gray-200 rounded-full h-2 mb-6">
              <div
                className="bg-[#050E7F] h-2 rounded-full transition-all duration-500"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
          )}

          <button
            onClick={handleCVSubmit}
            disabled={isProcessing}
            className={`w-full sm:w-3/4 bg-[#050E7F] text-white py-3 rounded-full hover:bg-indigo-700 transition ${
              isProcessing ? "opacity-60 cursor-not-allowed" : ""
            }`}
          >
            {isProcessing
              ? uploadProgress < 100
                ? "Uploading..."
                : "Analyzing..."
              : "Upload & Analyze CV"}
          </button>
        </div>
      </div>
    </div>
  );
}
