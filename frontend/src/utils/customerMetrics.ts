export const getVipLevelFromGMV = (gmv: number): string => {
  const gmvInMillions = gmv / 1_000_000;

  if (gmvInMillions < 1) {
    return "VIP 0";
  } else if (gmvInMillions < 10) {
    // 1 -> Vip 1, 9 -> Vip 9
    const level = Math.floor(gmvInMillions);
    return `VIP ${level}`;
  } else if (gmvInMillions < 60) {
    // 10 -> Vip 10, 15 -> Vip 11. (gmv - 10) / 5 + 10
    const level = Math.floor((gmvInMillions - 10) / 5) + 10;
    return `VIP ${Math.min(level, 19)}`;
  } else if (gmvInMillions < 160) {
    // 60 -> Vip 20, 70 -> Vip 21. (gmv - 60) / 10 + 20
    const level = Math.floor((gmvInMillions - 60) / 10) + 20;
    return `VIP ${Math.min(level, 29)}`;
  } else {
    // 160 -> Vip 30, 210 -> Vip 31. (gmv - 160) / 50 + 30
    const level = Math.floor((gmvInMillions - 160) / 50) + 30;
    return `VIP ${Math.min(level, 39)}`;
  }
};

export const getAOVClass = (aov: number): string => {
  if (aov < 500_000) return "A";
  if (aov < 1_000_000) return "B";
  if (aov < 2_000_000) return "C";
  if (aov <= 3_000_000) return "D";
  return "E";
};
