import { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const AuthContext = createContext(null);

export function formatApiError(detail) {
    if (detail == null) return "Something went wrong. Please try again.";
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail))
        return detail
            .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
            .filter(Boolean)
            .join(" ");
    if (detail && typeof detail.msg === "string") return detail.msg;
    return String(detail);
}

export function AuthProvider({ children }) {
    // null = checking session, false = logged out, object = logged in
    const [user, setUser] = useState(null);

    useEffect(() => {
        axios
            .get(`${API}/auth/me`, { withCredentials: true })
            .then(({ data }) => setUser(data))
            .catch(() => setUser(false));
    }, []);

    const login = async (email, password) => {
        const { data } = await axios.post(
            `${API}/auth/login`,
            { email, password },
            { withCredentials: true }
        );
        setUser(data);
        return data;
    };

    const register = async (name, email, password) => {
        const { data } = await axios.post(
            `${API}/auth/register`,
            { name, email, password },
            { withCredentials: true }
        );
        setUser(data);
        return data;
    };

    const logout = async () => {
        try {
            await axios.post(`${API}/auth/logout`, {}, { withCredentials: true });
        } finally {
            setUser(false);
        }
    };

    return (
        <AuthContext.Provider value={{ user, setUser, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
export { API as API_BASE };
