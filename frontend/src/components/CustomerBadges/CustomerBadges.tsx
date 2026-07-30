import { getVipLevelFromGMV, getAOVClass } from "@/utils/customerMetrics";

export const VipBadge = ({ gmv }: { gmv: number }) => {
  const level = getVipLevelFromGMV(gmv);
  let color = "#6b7280"; // gray-500
  let bgColor = "#f3f4f6"; // gray-100

  if (level === "VIP 0") {
    color = "#6b7280";
    bgColor = "#f3f4f6";
  } else if (level.startsWith("VIP ")) {
    const splitStr = level.split(" ");
    const num = parseInt(splitStr[1] || "0");
    if (num < 10) {
      color = "#059669"; // emerald-600
      bgColor = "#d1fae5"; // emerald-100
    } else if (num < 20) {
      color = "#2563eb"; // blue-600
      bgColor = "#dbeafe"; // blue-100
    } else if (num < 30) {
      color = "#7c3aed"; // violet-600
      bgColor = "#ede9fe"; // violet-100
    } else {
      color = "#be123c"; // rose-700
      bgColor = "#ffe4e6"; // rose-100
    }
  }

  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "12px",
        fontSize: "12px",
        fontWeight: "600",
        color: color,
        backgroundColor: bgColor,
        whiteSpace: "nowrap",
      }}
    >
      {level}
    </span>
  );
};

export const AOVBadge = ({ aov }: { aov: number }) => {
  const aovClass = getAOVClass(aov);
  let color = "#6b7280";
  let bgColor = "#f3f4f6";

  switch (aovClass) {
    case "A":
      color = "#6b7280"; // gray
      bgColor = "#f3f4f6";
      break;
    case "B":
      color = "#059669"; // emerald
      bgColor = "#d1fae5";
      break;
    case "C":
      color = "#2563eb"; // blue
      bgColor = "#dbeafe";
      break;
    case "D":
      color = "#7c3aed"; // violet
      bgColor = "#ede9fe";
      break;
    case "E":
      color = "#be123c"; // rose
      bgColor = "#ffe4e6";
      break;
  }

  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "6px",
        fontSize: "12px",
        fontWeight: "700",
        color: color,
        backgroundColor: bgColor,
        whiteSpace: "nowrap",
      }}
    >
      Hạng {aovClass}
    </span>
  );
};

export const CombinedVipBadge = ({ gmv, aov }: { gmv: number; aov: number }) => {
  const vipStr = getVipLevelFromGMV(gmv);
  const vipShort = vipStr.replace(" ", " "); // "VIP0"
  const aovClass = getAOVClass(aov); // "A"
  const combined = `${vipShort} ${aovClass}`; // "VIP0A"

  let color = "#6b7280"; // gray-500
  let bgColor = "#f3f4f6"; // gray-100

  if (vipStr === "VIP 0") {
    color = "#6b7280";
    bgColor = "#f3f4f6";
  } else if (vipStr.startsWith("VIP ")) {
    const splitStr = vipStr.split(" ");
    const num = parseInt(splitStr[1] || "0");
    if (num < 10) {
      color = "#059669"; // emerald-600
      bgColor = "#d1fae5"; // emerald-100
    } else if (num < 20) {
      color = "#2563eb"; // blue-600
      bgColor = "#dbeafe"; // blue-100
    } else if (num < 30) {
      color = "#7c3aed"; // violet-600
      bgColor = "#ede9fe"; // violet-100
    } else {
      color = "#be123c"; // rose-700
      bgColor = "#ffe4e6"; // rose-100
    }
  }

  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 8px",
        borderRadius: "12px",
        fontSize: "13px",
        fontWeight: "700",
        color: color,
        backgroundColor: bgColor,
        whiteSpace: "nowrap",
      }}
    >
      {combined}
    </span>
  );
};
