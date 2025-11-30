export const getAvatarGradient = (username) => {
    // Generate a consistent index based on the username string
    let hash = 0;
    const str = username || 'default';
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    const gradients = [
        ['#3b82f6', '#2563eb'], // Blue
        ['#f97316', '#dc2626'], // Orange-Red
        ['#a855f7', '#db2777'], // Purple-Pink
        ['#06b6d4', '#2563eb'], // Cyan-Blue
        ['#eab308', '#ea580c'], // Yellow-Orange
        ['#64748b', '#475569'], // Slate
        ['#ef4444', '#ea580c'], // Red-Orange
        ['#10b981', '#059669'], // Green
    ];

    // Use absolute value of hash to ensure positive index
    const index = Math.abs(hash) % gradients.length;
    return gradients[index];
};

// Format date as YYYY-MM-DD in local timezone
export const formatLocalDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Get today's date in local timezone
export const getLocalDate = () => {
    return formatLocalDate(new Date());
};

// Format date for display
export const formatDisplayDate = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString(undefined, { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
    });
};

// Format time for display
export const formatTime = (isoString) => {
    return new Date(isoString).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
};

