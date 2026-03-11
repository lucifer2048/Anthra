/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require("nativewind/preset")],
  darkMode: "class",
  content: ["./App.tsx", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#E8F7FF",
        panel: "#FDFEFF",
        neon: {
          green: "#5BE8B4",
          amber: "#FFC670",
          blue: "#05AED5",
          red: "#FF6E7F"
        }
      }
    }
  },
  plugins: []
};
