import { useState } from "react";
import { useNavigate, Link } from "react-router-dom"; // <-- import Link
import Alert from "../components/Alert";
import BackButton from "../components/BackButton";

const baseURL = import.meta.env.VITE_API_BASE_URL;

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${baseURL}/api/users/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      console.log("Login backend response:", data);

      if (!res.ok) {
        setError(data.detail || "Invalid credentials");
        setLoading(false);
        return;
      }

      localStorage.setItem("accessToken", data.access);
      localStorage.setItem("refreshToken", data.refresh);
      localStorage.setItem("user", JSON.stringify(data.user));

      setEmail("");
      setPassword("");
      setLoading(false);

      navigate("/");
      window.location.reload();
    } catch (err) {
      setError("Network error");
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-r from-white via-pink-50 to-indigo-50">
      <BackButton to="/" title="Back to Home" />
      <div className="max-w-md w-full mx-auto p-8 rounded-2xl shadow-2xl bg-gray-100">
        <h2 className="text-3xl font-bold mb-6 text-center">Login</h2>

        {error && (
          <Alert
            title="Error"
            type="error"
            message={error}
            onClose={() => setError("")}
          />
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <label className=" text-sm font-medium">Email</label>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full mt-1 p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#050E7F]"
            required
          />

          <label className=" text-sm font-medium">Password</label>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full mt-1 p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#050E7F]"
            required
          />

          {/* Forgot Password Link */}
          <div className="text-right">
            <Link
              to="/recover-password"
              className="text-sm text-[#050E7F] font-semibold hover:underline"
            >
              Forgot Password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3 rounded-xl font-semibold transition-all ${
              loading
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-[#050E7F] text-white hover:scale-105 transform"
            }`}
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <p className="mt-4 text-center text-gray-600">
          Already have an account?{" "}
          <Link
            to="/register"
            className="text-[#050E7F] font-semibold cursor-pointer hover:underline"
          >
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
