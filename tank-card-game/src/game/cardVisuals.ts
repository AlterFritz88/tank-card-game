import { getNationFlagAsset } from "../assets/nationFlagAssets";
import type { Nation, TankCard } from "./types";

export type NationVisual = {
  label: string;
  shortLabel: string;
  background: string;
  accent: string;
  flagBackground: string;
  flagImage: string | null;
};

export type ClassVisual = {
  label: string;
  icon: string;
  accent: string;
};

export function getNationFlagStyle(nation: NationVisual) {
  return nation.flagImage
    ? {
        backgroundImage: `url("${nation.flagImage}")`,
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
      }
    : {
        background: nation.flagBackground,
      };
}

export function getNationVisual(nation: TankCard["nation"] | Nation): NationVisual {
  switch (nation) {
    case "ussr":
      return {
        label: "USSR",
        shortLabel: "USSR",
        background:
          "linear-gradient(135deg, rgba(150, 20, 20, 0.95), rgba(52, 10, 10, 0.95))",
        accent: "#ff5555",
        flagBackground:
          "linear-gradient(180deg, #b51d2b 0%, #b51d2b 100%)",
        flagImage: getNationFlagAsset(nation),
      };

    case "germany":
      return {
        label: "Germany",
        shortLabel: "DE",
        background:
          "linear-gradient(135deg, rgba(38, 38, 38, 0.95), rgba(110, 28, 28, 0.82), rgba(165, 132, 38, 0.82))",
        accent: "#d7b75f",
        flagBackground:
          "linear-gradient(180deg, #171717 0%, #171717 33%, #a62b30 33%, #a62b30 66%, #d9b341 66%, #d9b341 100%)",
        flagImage: getNationFlagAsset(nation),
      };

    case "usa":
      return {
        label: "USA",
        shortLabel: "USA",
        background:
          "linear-gradient(135deg, rgba(31, 57, 114, 0.95), rgba(120, 28, 38, 0.85))",
        accent: "#7aa2ff",
        flagBackground:
          "repeating-linear-gradient(180deg, #b52c38 0%, #b52c38 8%, #f0eee8 8%, #f0eee8 16%)",
        flagImage: getNationFlagAsset(nation),
      };

    case "uk":
      return {
        label: "UK",
        shortLabel: "UK",
        background:
          "linear-gradient(135deg, rgba(31, 45, 96, 0.95), rgba(130, 28, 45, 0.85))",
        accent: "#8fb7ff",
        flagBackground:
          "linear-gradient(135deg, transparent 42%, #f0eee8 42%, #f0eee8 48%, #b22638 48%, #b22638 53%, #f0eee8 53%, #f0eee8 59%, transparent 59%), linear-gradient(45deg, transparent 42%, #f0eee8 42%, #f0eee8 48%, #b22638 48%, #b22638 53%, #f0eee8 53%, #f0eee8 59%, transparent 59%), linear-gradient(180deg, transparent 41%, #f0eee8 41%, #f0eee8 59%, transparent 59%), linear-gradient(90deg, transparent 42%, #f0eee8 42%, #f0eee8 58%, transparent 58%), #233b77",
        flagImage: getNationFlagAsset(nation),
      };

    case "poland":
      return {
        label: "Poland",
        shortLabel: "PL",
        background:
          "linear-gradient(135deg, rgba(238, 238, 232, 0.96), rgba(165, 42, 52, 0.9))",
        accent: "#ef6b76",
        flagBackground:
          "linear-gradient(180deg, #f1f0ea 0%, #f1f0ea 50%, #c83c4b 50%, #c83c4b 100%)",
        flagImage: getNationFlagAsset(nation),
      };

    case "france":
      return {
        label: "France",
        shortLabel: "FR",
        background:
          "linear-gradient(135deg, rgba(35, 61, 134, 0.95), rgba(236, 236, 226, 0.9), rgba(179, 42, 55, 0.92))",
        accent: "#8aa8ff",
        flagBackground:
          "linear-gradient(90deg, #25458f 0%, #25458f 33%, #f1f0ea 33%, #f1f0ea 66%, #bd3545 66%, #bd3545 100%)",
        flagImage: getNationFlagAsset(nation),
      };

    default:
      return {
        label: "Unknown",
        shortLabel: "N/A",
        background:
          "linear-gradient(135deg, rgba(50, 50, 50, 0.95), rgba(20, 20, 20, 0.95))",
        accent: "#aaaaaa",
        flagBackground:
          "linear-gradient(135deg, #3d4247, #202326)",
        flagImage: null,
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
