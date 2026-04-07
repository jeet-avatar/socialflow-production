// API Configuration
// This file centralizes the API base URL configuration

// Get API URL from environment variable or use default
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'https://socialflow.network';

// Export for convenience
export default API_BASE_URL;
