import axios from 'axios'

const configuredBaseURL = import.meta.env.VITE_API_BASE_URL?.trim() || '/'
const apiOrigin = new URL(configuredBaseURL, window.location.origin)
if (apiOrigin.origin !== window.location.origin || apiOrigin.pathname !== '/' || apiOrigin.search || apiOrigin.hash || apiOrigin.username || apiOrigin.password) {
    throw new Error('VITE_API_BASE_URL must be / or this frontend origin. Configure the external Laravel host in vercel.json rewrites.')
}

export const api = axios.create({
    // Vercel proxies these same-origin requests to the separately hosted API.
    baseURL: apiOrigin.href,
    headers: {
        Accept: 'application/json',
    },
    withCredentials: true,
    withXSRFToken: true,
})
