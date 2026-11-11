import React, { useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

interface GoogleSignInProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

declare global {
  interface Window {
    google?: any;
  }
}

export const GoogleSignIn: React.FC<GoogleSignInProps> = ({ onSuccess, onError }) => {
  const buttonRef = useRef<HTMLDivElement>(null);
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = React.useState(false);

  useEffect(() => {
    const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;

    if (!clientId || clientId === 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com') {
      console.warn('Google Client ID not configured');
      return;
    }

    // Wait for Google script to load
    const initializeGoogle = () => {
      if (window.google && buttonRef.current) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredentialResponse,
          auto_select: false,
        });

        window.google.accounts.id.renderButton(
          buttonRef.current,
          {
            theme: 'outline',
            size: 'large',
            width: buttonRef.current.offsetWidth || 300,
            text: 'continue_with',
            shape: 'rectangular',
          }
        );
      }
    };

    // Check if Google script is already loaded
    if (window.google) {
      initializeGoogle();
    } else {
      // Wait for script to load
      const checkGoogle = setInterval(() => {
        if (window.google) {
          clearInterval(checkGoogle);
          initializeGoogle();
        }
      }, 100);

      // Cleanup
      return () => clearInterval(checkGoogle);
    }
    // Initialise Google Sign-In once on mount; the callback only uses stable
    // setters/navigate, so re-running on every render is not wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCredentialResponse = async (response: any) => {
    setIsLoading(true);

    try {
      // Send credential to backend. The backend sets httpOnly auth cookies and
      // returns only the user record (no tokens in the body).
      const result = await axios.post(
        `${process.env.REACT_APP_API_URL || 'http://localhost:8000/api'}/auth/google/callback`,
        { credential: response.credential },
        { withCredentials: true }
      );

      if (result.data.success) {
        setUser(result.data.user);

        if (onSuccess) {
          onSuccess();
        } else {
          navigate('/app');
        }
      }
    } catch (error: any) {
      console.error('Google Sign-In error:', error);
      const errorMessage = error.response?.data?.detail || 'Google Sign-In failed';
      
      if (onError) {
        onError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;

  // Don't render if Google OAuth not configured
  if (!clientId || clientId === 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com') {
    return null;
  }

  return (
    <div className="w-full">
      {isLoading ? (
        <div className="w-full py-2 px-4 border-2 border-slate-300 dark:border-zinc-700 rounded-md flex items-center justify-center">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-sm text-slate-600 dark:text-slate-400">Signing in...</span>
        </div>
      ) : (
        <div ref={buttonRef} className="w-full flex justify-center"></div>
      )}
    </div>
  );
};
