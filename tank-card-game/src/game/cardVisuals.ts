import type { TankCard } from "./types";

export type NationVisual = {
  label: string;
  shortLabel: string;
  background: string;
  accent: string;
};

export type ClassVisual = {
  label: string;
  icon: string;
  accent: string;
};

export function getNationVisual(nation: TankCard["nation"]): NationVisual {
  switch (nation) {
    case "ussr":
      return {
        label: "USSR",
        shortLabel: "USSR",
        background:
          "linear-gradient(135deg, rgba(150, 20, 20, 0.95), rgba(52, 10, 10, 0.95))",
        accent: "#ff5555",
      };

    case "germany":
      return {
        label: "Germany",
        shortLabel: "DE",
        background:
          "linear-gradient(135deg, rgba(38, 38, 38, 0.95), rgba(110, 28, 28, 0.82), rgba(165, 132, 38, 0.82))",
        accent: "#d7b75f",
      };

    case "usa":
      return {
        label: "USA",
        shortLabel: "USA",
        background:
          "linear-gradient(135deg, rgba(31, 57, 114, 0.95), rgba(120, 28, 38, 0.85))",
        accent: "#7aa2ff",
      };

    case "uk":
      return {
        label: "UK",
        shortLabel: "UK",
        background:
          "linear-gradient(135deg, rgba(31, 45, 96, 0.95), rgba(130, 28, 45, 0.85))",
        accent: "#8fb7ff",
      };

    default:
      return {
        label: "Unknown",
        shortLabel: "N/A",
        background:
          "linear-gradient(135deg, rgba(50, 50, 50, 0.95), rgba(20, 20, 20, 0.95))",
        accent: "#aaaaaa",
      };
  }
}

export function getClassVisual(vehicleClass: TankCard["class"]): ClassVisual {
  switch (vehicleClass) {
    case "light":
      return {
        label: "Light",
        icon: "⚡",
        accent: "#7de38d",
      };

    case "medium":
      return {
        label: "Medium",
        icon: "◈",
        accent: "#6fb7ff",
      };

    case "heavy":
      return {
        label: "Heavy",
        icon: "🛡",
        accent: "#d6a84f",
      };

    case "td":
      return {
        label: "TD",
        icon: "🎯",
        accent: "#ff6b5f",
      };

    case "spg":
      return {
        label: "SPG",
        icon: "💥",
        accent: "#c084fc",
      };

    default:
      return {
        label: "Unit",
        icon: "◆",
        accent: "#aaaaaa",
      };
  }
}