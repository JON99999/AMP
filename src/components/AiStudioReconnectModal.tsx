import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, ExternalLink, Folder, KeyRound, RefreshCw } from "lucide-react";
import {
  exchangePlaygroundAuthCode,
  getAccessToken,
  getPlaygroundDirectConsentUrl,
  getRefreshToken,
  parseAndExtractAuthTokens,
  refreshAccessTokenSilently,
  setOverrideAccessToken,
  setRefreshToken,
  syncAuthSessionToServer,
} from "../lib/driveService";

interface AiStudioReconnectModalProps {
  isOpen: boolean;
  connectionReason?: string | null;
  setToken: (token: string | null) => void;
  setUser: (user: any) => void;
  onReconnectSuccess: (accessToken: string) => Promise<{ valid: boolean; errorMessage?: string }>;
  onGoToFolders: () => void;
}

export const AiStudioReconnectModal: React.FC<AiStudioReconnectModalProps> = ({
  isOpen,
  connectionReason,
  setToken,
  setUser,
  onReconnectSuccess,
  onGoToFolders,
}) => {
  const [connectString, setConnectString] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      setIsConnecting(false);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 40);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAuthenticateClick = () => {
    setErrorMsg(null);
    const consentUrl = getPlaygroundDirectConsentUrl();
    window.open(
      consentUrl,
      "amp_oauth_playground_popup",
      "width=560,height=720,menubar=no,toolbar=no,location=yes,status=no",
    );
    setTimeout(() => {
      inputRef.current?.focus();
    }, 80);
  };

  const handleTryConnection = async (rawValue?: string) => {
    const raw = (rawValue !== undefined ? rawValue : connectString).trim();
    if (!raw || isConnecting) return;

    setIsConnecting(true);
    setErrorMsg(null);

    try {
      const extracted = parseAndExtractAuthTokens(raw);
      let activeAccess = extracted.accessToken;
      let activeRefresh = extracted.refreshToken;
      let expiresAt = extracted.expiresIn
        ? Date.now() + extracted.expiresIn * 1000
        : Date.now() + 3550 * 1000;

      if (extracted.authCode) {
        const exchanged = await exchangePlaygroundAuthCode(extracted.authCode);
        activeAccess = exchanged.accessToken;
        if (exchanged.refreshToken) {
          activeRefresh = exchanged.refreshToken;
        }
        expiresAt = exchanged.expiresAt;
      }

      if (activeRefresh) {
        setRefreshToken(activeRefresh, expiresAt);
      }

      if (!activeAccess && activeRefresh) {
        activeAccess = await refreshAccessTokenSilently(activeRefresh);
        if (!activeAccess) {
          throw new Error(
            "Could not exchange refresh token for an access token. Click Authenticate and paste the resulting code.",
          );
        }
      }

      if (!activeAccess) {
        throw new Error(
          "No valid authorization code, access_token, or refresh_token found in the connect string.",
        );
      }

      setOverrideAccessToken(activeAccess);

      let userObj: any = null;
      try {
        const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${activeAccess}` },
        });
        if (userInfoRes.ok) {
          const userData = await userInfoRes.json();
          userObj = {
            displayName: userData.name || userData.email || "Authenticated User",
            email: userData.email || "",
            photoURL: userData.picture || "",
          };
        }
      } catch {
        // Proceed to Drive validation check
      }

      const validation = await onReconnectSuccess(activeAccess);
      const finalToken = getAccessToken() || activeAccess;
      setOverrideAccessToken(finalToken);

      if (!userObj) {
        userObj = {
          email: "manual-session@amp.local",
          displayName: "AI Studio Reconnect",
        };
      }
      setUser(userObj);
      localStorage.setItem("amp_user_profile", JSON.stringify(userObj));

      await syncAuthSessionToServer({
        accessToken: finalToken,
        refreshToken: activeRefresh || getRefreshToken(),
        expiresAt,
        userProfile: userObj,
      });
      setToken(finalToken);

      if (!validation.valid) {
        setErrorMsg(
          validation.errorMessage ||
            "Connected account could not access configured Google Drive folders.",
        );
        setIsConnecting(false);
        return;
      }

      setConnectString("");
      setIsConnecting(false);
    } catch (err: any) {
      setErrorMsg(
        err?.message || "Connection failed. Check your connect string or click Go to Folders.",
      );
      setIsConnecting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-amber-400 shrink-0" />
            <h2 className="text-xs font-black uppercase tracking-wider">
              Reconnect Google Drive
            </h2>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-amber-300 border border-slate-700">
            AI Studio
          </span>
        </div>

        <div className="p-4 space-y-3.5">
          {connectionReason && (
            <p className="text-xs text-slate-600 font-medium leading-relaxed">
              {connectionReason}
            </p>
          )}

          <button
            type="button"
            disabled={isConnecting}
            onClick={handleAuthenticateClick}
            className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-50"
          >
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            <span>Authenticate</span>
          </button>

          <div className="space-y-1">
            <label
              htmlFor="aistudio-reconnect-input"
              className="block text-[11px] font-bold uppercase tracking-wider text-slate-600"
            >
              Connect String (Press Enter to Connect)
            </label>
            <div className="relative flex items-center">
              <input
                ref={inputRef}
                id="aistudio-reconnect-input"
                type="text"
                disabled={isConnecting}
                value={connectString}
                onChange={(e) => {
                  setConnectString(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleTryConnection();
                  }
                }}
                placeholder="Paste connect string (4/0A...) and press Enter"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white rounded-lg text-xs font-mono text-slate-900 outline-none transition disabled:opacity-60"
                autoFocus
              />
              {isConnecting && (
                <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin absolute right-3" />
              )}
            </div>
          </div>

          {errorMsg && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 text-xs text-rose-800 font-medium">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span className="break-words leading-snug">{errorMsg}</span>
            </div>
          )}
        </div>

        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={isConnecting}
            onClick={onGoToFolders}
            className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-black uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Folder className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>Go to Folders</span>
          </button>

          {connectString.trim().length > 0 && (
            <button
              type="button"
              disabled={isConnecting}
              onClick={() => handleTryConnection()}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-black uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isConnecting && <RefreshCw className="w-3 h-3 animate-spin" />}
              <span>{isConnecting ? "Connecting..." : "Connect"}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
