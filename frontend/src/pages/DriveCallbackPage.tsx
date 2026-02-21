import { useEffect, useState } from "react";
import { sendDriveAuthCode } from "@/services/api";

/**
 * OAuth2 callback page for Google Drive.
 * Opens in a popup window — exchanges the auth code, then closes itself.
 * Route: /drive-callback?code=...
 */
export default function DriveCallbackPage() {
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const errorParam = params.get("error");

    if (errorParam) {
      setStatus("error");
      setError(errorParam === "access_denied" ? "Access denied by user" : errorParam);
      // Notify the opener and close after a delay
      if (window.opener) {
        window.opener.postMessage({ type: "drive-auth-error", error: errorParam }, "*");
      }
      setTimeout(() => window.close(), 2000);
      return;
    }

    if (!code) {
      setStatus("error");
      setError("No authorization code received");
      setTimeout(() => window.close(), 2000);
      return;
    }

    // Exchange the code for credentials
    sendDriveAuthCode(code)
      .then(() => {
        setStatus("success");
        if (window.opener) {
          window.opener.postMessage({ type: "drive-auth-success" }, "*");
        }
        setTimeout(() => window.close(), 1500);
      })
      .catch((err) => {
        setStatus("error");
        const msg = err?.response?.data?.detail ?? err.message ?? "Authentication failed";
        setError(msg);
        if (window.opener) {
          window.opener.postMessage({ type: "drive-auth-error", error: msg }, "*");
        }
        setTimeout(() => window.close(), 3000);
      });
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-8 max-w-sm text-center">
        {status === "processing" && (
          <>
            <div className="text-4xl mb-4 animate-spin">⚙️</div>
            <h2 className="text-lg font-semibold text-zinc-200">Connecting Google Drive...</h2>
            <p className="text-sm text-zinc-400 mt-2">Please wait while we complete authentication.</p>
          </>
        )}
        {status === "success" && (
          <>
            <div className="text-4xl mb-4">✅</div>
            <h2 className="text-lg font-semibold text-green-400">Connected!</h2>
            <p className="text-sm text-zinc-400 mt-2">This window will close automatically.</p>
          </>
        )}
        {status === "error" && (
          <>
            <div className="text-4xl mb-4">❌</div>
            <h2 className="text-lg font-semibold text-red-400">Connection Failed</h2>
            <p className="text-sm text-zinc-400 mt-2">{error}</p>
            <p className="text-xs text-zinc-500 mt-3">This window will close automatically.</p>
          </>
        )}
      </div>
    </div>
  );
}
