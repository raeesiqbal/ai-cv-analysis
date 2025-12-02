import logo from "../assets/Hero.jpg";
import { useNavigate } from "react-router-dom";

export default function HeroSection() {
  const navigate = useNavigate();

  return (
    <section className="flex flex-col-reverse md:flex-row items-center justify-between px-6 sm:px-12 md:px-20 py-12 md:py-16 bg-gradient-to-r from-white via-pink-50 to-indigo-50">
      {/* Text Section */}
      <div className="w-full md:w-1/2 text-center md:text-left mt-8 md:mt-0">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold  mb-4 leading-snug">
          Build Your <span className="text-[#050E7F]">AI-Powered CV</span>
        </h1>
        <p className=" mb-6 font-semibold text-sm sm:text-base md:text-lg">
          Generate a professional resume and get ready for your next interview
          using AI.
        </p>
        <button
          onClick={() => navigate("/upload-cv")}
          className="bg-[#050E7F] text-white px-7 py-4 font-bold rounded-full hover:bg-indigo-700 transition text-sm sm:text-base"
        >
          Start CV Analysis
        </button>
      </div>

      {/* Image Section */}
      <div className="w-full md:w-1/2 flex justify-center md:justify-end">
        <img
          src={logo}
          alt="Hero"
          className="w-full md:max-w-xl object-contain"
        />
      </div>
    </section>
  );
}
