import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Alert from "../components/Alert";
import { Link } from "react-router-dom";
import BackButton from "../components/BackButton";
const baseURL = import.meta.env.VITE_API_BASE_URL;

export default function RegisterForm() {
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState("jobseeker");
  const [linkedinProfile, setLinkedinProfile] = useState("");
  const [bio, setBio] = useState("");
  const [profilePicture, setProfilePicture] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("username", username.trim());
      formData.append("first_name", firstName.trim());
      formData.append("last_name", lastName.trim());
      formData.append("email", email.trim());
      formData.append("password", password);
      formData.append("account_type", accountType);

      if (linkedinProfile)
        formData.append("linkedin_profile", linkedinProfile.trim());
      if (bio) formData.append("bio", bio.trim());
      if (profilePicture) formData.append("profile_picture", profilePicture);

      const res = await fetch(`${baseURL}/api/users/`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        const messages = [];
        for (const key in data) {
          if (Array.isArray(data[key]))
            messages.push(`${key}: ${data[key].join(" ")}`);
          else messages.push(`${key}: ${data[key]}`);
        }
        setError(messages.join(" | "));
        setLoading(false);
        return;
      }

      // ✅ Reset form
      setUsername("");
      setFirstName("");
      setLastName("");
      setEmail("");
      setPassword("");
      setAccountType("jobseeker");
      setLinkedinProfile("");
      setBio("");
      setProfilePicture(null);
      setLoading(false);

      // Show success alert and redirect after 2 seconds
      setSuccess("Registration successful! Redirecting to login...");
      setTimeout(() => {
        navigate("/login");
      }, 2000);
    } catch (err) {
      console.error(err);
      setError("Network error — please check your connection.");
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-r from-white via-pink-50 to-indigo-50 ">
      <BackButton to="/" title="Back to Home" />
      <div className="max-w-3xl w-full mx-auto p-8 m-4 rounded-2xl shadow-2xl bg-gray-100">
        <h2 className="text-3xl font-bold mb-6 text-center">Register</h2>

        {error && (
          <Alert
            title="Error"
            type="error"
            message={error}
            onClose={() => setError("")}
          />
        )}

        {success && (
          <Alert
            title="Success"
            type="success"
            message={success}
            onClose={() => setSuccess("")}
          />
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-5"
          encType="multipart/form-data"
        >
          {/* Username + Email */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col">
              <label className="mb-2 text-sm font-medium ">Username</label>
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#050E7F]"
                required
              />
            </div>

            <div className="flex flex-col">
              <label className="mb-2 text-sm font-medium ">Email</label>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#050E7F]"
                required
              />
            </div>
          </div>

          {/* First + Last Name */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col">
              <label className="mb-2 text-sm font-medium">First Name</label>
              <input
                type="text"
                placeholder="First Name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#050E7F]"
              />
            </div>

            <div className="flex flex-col">
              <label className="mb-2 text-sm font-medium ">Last Name</label>
              <input
                type="text"
                placeholder="Last Name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#050E7F]"
              />
            </div>
          </div>

          {/* Password + Account Type */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col">
              <label className="mb-2 text-sm font-medium">Password</label>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#050E7F]"
                required
              />
            </div>

            <div className="flex flex-col">
              <label className="mb-2 text-sm font-medium ">Account Type</label>
              <select
                value={accountType}
                onChange={(e) => setAccountType(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#050E7F]"
              >
                <option value="jobseeker">Job Seeker</option>
                <option value="recruiter">Recruiter</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>

          {/* LinkedIn + Bio */}
          <div className="flex flex-col">
            <label className="mb-2 text-sm font-medium ">
              LinkedIn Profile (optional)
            </label>
            <input
              type="url"
              placeholder="LinkedIn Profile"
              value={linkedinProfile}
              onChange={(e) => setLinkedinProfile(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#050E7F]"
            />
          </div>

          <div className="flex flex-col">
            <label className="mb-2 text-sm font-medium ">Bio (optional)</label>
            <textarea
              placeholder="Bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#050E7F]"
            />
          </div>

          {/* Profile Picture */}
          <div className="flex flex-col">
            <label className="mb-2 text-sm font-medium ">Profile Picture</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setProfilePicture(e.target.files[0])}
              className="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#050E7F]"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3 rounded-xl font-semibold transition-all ${
              loading
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-[#050E7F] text-white hover:scale-105 transform"
            }`}
          >
            {loading ? "Registering..." : "Register"}
          </button>
        </form>

        <p className="mt-4 text-center text-gray-600">
          Already have an account?{" "}
          <Link
            to="/login"
            className="text-[#050E7F] font-semibold cursor-pointer hover:underline"
          >
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}
