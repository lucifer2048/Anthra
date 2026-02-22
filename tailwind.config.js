/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require("nativewind/preset")],
  content: ["./App.tsx", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#020202",
        panel: "#0A0A0A",
        neon: {
          green: "#67FF8A",
          amber: "#FFB547",
          blue: "#52B7FF",
          red: "#FF5757"
        }
      }
    }
  },
  plugins: []
};
