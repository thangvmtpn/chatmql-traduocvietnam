export const formatDateTime = (dateString?: string) => {
    if (!dateString) return "Chưa xác định";
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  };
  
  export const getScheduleStatus = (dateString?: string) => {
    if (!dateString) return "upcoming";
    const scheduleDate = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
  
    if (scheduleDate < today) return "overdue";
    if (scheduleDate >= today && scheduleDate < tomorrow) return "today";
    return "upcoming";
  };