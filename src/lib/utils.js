export const getAvatarGradient = (username) => {
    // Generate a consistent index based on the username string
    let hash = 0;
    const str = username || 'default';
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    const gradients = [
        'linear-gradient(135deg, #3b82f6, #2563eb)', // Blue
        'linear-gradient(135deg, #f97316, #dc2626)', // Orange-Red
        'linear-gradient(135deg, #a855f7, #db2777)', // Purple-Pink
        'linear-gradient(135deg, #06b6d4, #2563eb)', // Cyan-Blue
        'linear-gradient(135deg, #eab308, #ea580c)', // Yellow-Orange
        'linear-gradient(135deg, #64748b, #475569)', // Slate
        'linear-gradient(135deg, #ef4444, #ea580c)', // Red-Orange
        'linear-gradient(135deg, #10b981, #059669)', // Green
    ];

    // Use absolute value of hash to ensure positive index
    const index = Math.abs(hash) % gradients.length;
    return gradients[index];
};
