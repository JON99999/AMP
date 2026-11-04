/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Globe, Key, FileCode, CheckCircle, AlertCircle, RefreshCw, LogOut, Copy, ExternalLink, ShieldCheck, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import {
  verifyGoogleDriveDetails,
  getSavedSettings,
  saveSettings,
  getAccessToken,
  getRefreshToken,
  setRefreshToken,
  parseAndExtractAuthTokens,
  exchangePlaygroundAuthCode,
  getPlaygroundDirectConsentUrl,
  refreshAccessTokenSilently,
  syncAuthSessionToServer,
  isElectronEnv,
} from '../lib/driveService';
import DriveAuthHelpModal from './DriveAuthHelpModal';

interface GoogleAuthSectionProps {
  user: any;
  token: string | null;
  setToken: (token: string | null) => void;
  setUser: (user: any) => void;
  googleClientId: string;
  setGoogleClientId: (id: string) => void;
  isPollingExternal: boolean;
  setIsPollingExternal: (polling: boolean) => void;
  setIsValidatingDrive: (validating: boolean) => void;
  setLoading: (loading: boolean) => void;
  setDriveValidationError: (error: boolean | string | null) => void;
  driveValidationError: string | null;
  validateGoogleDriveAccess: () => Promise<boolean>;
  fetchDataForMode: (settings?: any) => Promise<void>;
  handleAuthSignOut: () => Promise<void>;
  setOverrideAccessToken: (token: string | null) => void;
  draftDriveFolders?: any;
}

export function GoogleAuthSection({
  user,
  token,
  setToken,
  setUser,
  googleClientId,
  setGoogleClientId,
  isPollingExternal,
  setIsPollingExternal,
  setIsValidatingDrive,
  setLoading,
  setDriveValidationError,
  driveValidationError,
  validateGoogleDriveAccess,
  fetchDataForMode,
  handleAuthSignOut,
  setOverrideAccessToken,
  draftDriveFolders,
}: GoogleAuthSectionProps) {
  const isPreviewEnv = !isElectronEnv();
  const [activeTab, setActiveTab] = useState<'autopilot' | 'manual-transfer' | 'direct-token'>(
    isPreviewEnv ? 'direct-token' : 'autopilot'
  );
  const [copied, setCopied] = useState(false);
  const [manualCodeToken, setManualCodeToken] = useState('');
  const [localManualToken, setLocalManualToken] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(isPreviewEnv);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);
  const [isRefreshingToken, setIsRefreshingToken] = useState(false);
  const [hasSavedRefreshToken, setHasSavedRefreshToken] = useState<boolean>(() => !!getRefreshToken());

  useEffect(() => {
    setHasSavedRefreshToken(!!getRefreshToken());
  }, [token, user]);

  useEffect(() => {
    if (isPreviewEnv && !token) {
      setShowAdvanced(true);
      setActiveTab('direct-token');
    }
  }, [isPreviewEnv, token]);

  // Save the Client ID when modified
  const handleClientIdChange = (id: string) => {
    setGoogleClientId(id);
    localStorage.setItem('amp_google_client_id', id.trim());
  };

  // Helper to construct the OAuth login URL (Desktop loopback)
  const getOAuthUrl = (state?: string) => {
    const port = window.location.port || '3000';
    const redirectUri = `http://127.0.0.1:${port}/api/oauth-callback`;
    let url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(googleClientId.trim())}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=https://www.googleapis.com/auth/drive`;
    if (state) {
      url += `&state=${encodeURIComponent(state)}`;
    }
    return url;
  };

  // 1-Click Direct Google Account Chooser Popup via OAuth Playground's Drive-enabled client
  // (Skips Step 1 scope selection and avoids Firebase's unconfigured GCP project 403 error)
  const handleLaunchPlaygroundPopup = () => {
    const consentUrl = getPlaygroundDirectConsentUrl();
    const width = 620;
    const height = 740;
    const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
    const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
    window.open(
      consentUrl,
      'amp_oauth_playground_popup',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );
  };

  // Manual trigger to refresh access_token immediately using stored refresh_token
  const handleManualRefreshNow = async () => {
    const currentRefresh = getRefreshToken();
    if (!currentRefresh) return;
    try {
      setIsRefreshingToken(true);
      setDriveValidationError(null);
      const freshAccess = await refreshAccessTokenSilently(currentRefresh);
      if (freshAccess) {
        setOverrideAccessToken(freshAccess);
        setToken(freshAccess);
        const currentSettings = { ...getSavedSettings(), ...(draftDriveFolders || {}) };
        const driveResult = await verifyGoogleDriveDetails(currentSettings, freshAccess);
        if (driveResult.valid) {
          setDriveValidationError(null);
          await fetchDataForMode(currentSettings);
        }
      } else {
        setDriveValidationError('Could not refresh token automatically. Please launch the sign-in popup and paste a fresh code or Step 2 JSON.');
      }
    } catch (e: any) {
      setDriveValidationError(e?.message || 'Token refresh failed.');
    } finally {
      setIsRefreshingToken(false);
    }
  };

  // Option 1: Desktop Browser Loopback (Auto Callback)
  const handleLaunchAutopilot = async () => {
    if (!googleClientId.trim()) {
      setDriveValidationError('A Google OAuth Client ID is required to launch browser authentication.');
      return;
    }
    
    try {
      setLoading(true);
      setDriveValidationError(null);
      setIsValidatingDrive(true);
      setIsPollingExternal(true);

      const authUrl = getOAuthUrl();
      console.log('Launching external browser for Google OAuth Option 1 (Loopback):', authUrl);
      window.open(authUrl, '_blank');

      // Start looping and checking for token
      let pollCount = 0;
      const intervalId = setInterval(async () => {
        pollCount++;
        if (pollCount > 300) { // 5 minutes timeout
          clearInterval(intervalId);
          setIsPollingExternal(false);
          setIsValidatingDrive(false);
          setLoading(false);
          setDriveValidationError('Autopilot connection timed out. Verify your local server is reachable.');
          return;
        }

        try {
          const isCustomProtocol = typeof window !== 'undefined' && !window.location.protocol.startsWith('http');
          const baseUrl = isCustomProtocol ? 'http://127.0.0.1:3000' : '';
          const res = await fetch(`${baseUrl}/api/check-registered-token`);
          if (!res.ok) throw new Error('Unreachable loopback callback');
          const data = await res.json();
          if (data.token) {
            clearInterval(intervalId);
            setIsPollingExternal(false);
            
            // Set token and retrieve user details
            setOverrideAccessToken(data.token);
            setToken(data.token);
            
            // Fetch Google Profile details
            const userProfile = await fetchGoogleUserInfo(data.token);
            const userObj = userProfile || { email: 'authorized-device@amp.local', displayName: 'Loopback Verified Session' };
            setUser(userObj);
            localStorage.setItem('amp_user_profile', JSON.stringify(userObj));
            await syncAuthSessionToServer({
              accessToken: data.token,
              userProfile: userObj
            });
            
            // Validate Folder access
            const success = await validateGoogleDriveAccess();
            if (success) {
              setDriveValidationError(null);
              // Save updated state variables
              const currentSettings = getSavedSettings();
              await fetchDataForMode(currentSettings);
            } else {
              setDriveValidationError('OAuth Token verified, but Google API rejected direct access. Check shared parameters.');
            }
            setIsValidatingDrive(false);
            setLoading(false);
          }
        } catch (err) {
          console.warn('Loopback checker poll warning:', err);
        }
      }, 1000);

    } catch (e: any) {
      console.error('Option 1 OAuth launch failed:', e);
      setDriveValidationError(e.message || 'Failed to initialize external browser flow.');
      setIsValidatingDrive(false);
      setIsPollingExternal(false);
      setLoading(false);
    }
  };

  // Option 2: Copy-Paste OAuth Helper (Manual Redirection)
  const handleLaunchManualHelper = async () => {
    if (!googleClientId.trim()) {
      setDriveValidationError('A Google OAuth Client ID is required to generate the authentication consent link.');
      return;
    }
    const authUrl = getOAuthUrl('manual');
    console.log('Opening OAuth Helper URL:', authUrl);
    window.open(authUrl, '_blank');
  };

  const handleApplyManualHelperToken = async () => {
    if (!manualCodeToken.trim()) {
      setDriveValidationError('Please paste your Google Access Token to apply.');
      return;
    }
    await applyGenericToken(manualCodeToken.trim(), 'Manual Copy-Paste Verification');
  };

  // Option 3: Direct Manual Access Token / Auth Code / OAuth Playground JSON (Instant + Persistent Auto-Refresh)
  const handleApplyDirectToken = async () => {
    if (!localManualToken.trim()) {
      setDriveValidationError('Paste the Authorization Code (4/0A...), redirect URL, Step 2 JSON response, refresh_token, or access_token.');
      return;
    }
    await applyGenericToken(localManualToken.trim(), 'Direct Token Injection');
  };

  // Shared token application routines (supports 4/0A... auth code, redirect URL, full Step 2 JSON, refresh_token, or access_token)
  const applyGenericToken = async (inputToken: string, sessionLabel: string) => {
    try {
      setLoading(true);
      setDriveValidationError(null);
      setIsValidatingDrive(true);

      const extracted = parseAndExtractAuthTokens(inputToken);
      let activeAccess = extracted.accessToken;
      let activeRefresh = extracted.refreshToken;
      let expiresAt = extracted.expiresIn
        ? Date.now() + extracted.expiresIn * 1000
        : Date.now() + 3550 * 1000;

      // If user pasted a 4/0A... authorization code or OAuth Playground redirect URL, exchange it automatically!
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
        setHasSavedRefreshToken(true);
      }

      // If user pasted only a refresh_token (1//...) or no access_token, mint a fresh access_token right away
      if (!activeAccess && activeRefresh) {
        activeAccess = await refreshAccessTokenSilently(activeRefresh);
        if (!activeAccess) {
          throw new Error('Could not exchange the provided refresh_token for an access_token. Verify the token was generated in Google OAuth Playground.');
        }
      }

      if (!activeAccess) {
        throw new Error('No valid authorization code, access_token, or refresh_token found in the pasted value.');
      }

      // Store candidate token in memory/storage without firing React's [token] effect prematurely
      setOverrideAccessToken(activeAccess);

      // Merge any non-empty draft Drive folders so first-click validation and fetch use them immediately
      const savedSettings = getSavedSettings();
      const nonEmptyDrafts = Object.fromEntries(
        Object.entries(draftDriveFolders || {}).filter(([_, v]) => typeof v === 'string' && v.trim() !== '')
      );
      const currentSettings = { ...savedSettings, ...nonEmptyDrafts };
      if (Object.keys(nonEmptyDrafts).length > 0) {
        saveSettings(currentSettings);
      }

      // Verify token and drive folder access with detailed diagnostics (auto-refreshes if access_token was expired)
      const driveResult = await verifyGoogleDriveDetails(currentSettings, activeAccess);

      // If the token itself was rejected by Google Drive API (e.g. HTTP 401/403), do not save it as an active session
      if (!driveResult.tokenValid) {
        setOverrideAccessToken(null);
        setToken(null);
        setUser(null);
        setDriveValidationError(
          driveResult.errorMessage ||
            'Google Drive API rejected this token. Click "1. Open Google Sign-In Popup" below and paste the resulting code or Step 2 JSON.'
        );
        return;
      }

      // Use latest access token in case verifyGoogleDriveDetails refreshed an expired token from pasted JSON
      const finalToken = getAccessToken() || activeAccess;
      setOverrideAccessToken(finalToken);

      // Verify and set user profile
      let userObj = driveResult.tokenUser;
      if (!userObj) {
        userObj = await fetchGoogleUserInfo(finalToken);
      }
      if (!userObj) {
        userObj = { email: 'manual-session@amp.local', displayName: sessionLabel };
      }
      setUser(userObj);
      localStorage.setItem('amp_user_profile', JSON.stringify(userObj));

      await syncAuthSessionToServer({
        accessToken: finalToken,
        refreshToken: activeRefresh || getRefreshToken(),
        expiresAt,
        userProfile: userObj
      });
      setHasSavedRefreshToken(!!(activeRefresh || getRefreshToken()));
      setLocalManualToken('');
      setToken(finalToken);

      if (driveResult.valid) {
        setDriveValidationError(null);
        await fetchDataForMode(currentSettings);
      } else {
        const errorMsg = driveResult.errorMessage || 'Token verified, but the configured station folder could not be accessed.';
        setDriveValidationError(errorMsg);
      }
    } catch (e: any) {
      console.error('Token verification failed:', e);
      setDriveValidationError(e.message || 'Failed to apply and verify the Google OAuth token.');
    } finally {
      setIsValidatingDrive(false);
      setLoading(false);
    }
  };

  // Fetch helper for user profiles directly using google OAuth token
  const fetchGoogleUserInfo = async (accessTokenValue: string) => {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: {
          'Authorization': `Bearer ${accessTokenValue}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        return {
          email: data.email || 'authorized-device@amp.local',
          displayName: data.name || 'Authorized User'
        };
      }
      
      // Fallback
      const driveAboutRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
        headers: {
          'Authorization': `Bearer ${accessTokenValue}`
        }
      });
      if (driveAboutRes.ok) {
        const data = await driveAboutRes.json();
        if (data.user) {
          return {
            email: data.user.emailAddress || 'authorized-device@amp.local',
            displayName: data.user.displayName || 'Authorized User'
          };
        }
      }
      return null;
    } catch (e) {
      console.warn('Google profile fetch skipped:', e);
      return null;
    }
  };

  // Utility to handle copying the loopback URI helper configuration
  const handleCopyLoopbackUri = () => {
    const port = window.location.port || '3000';
    const loopUri = `http://127.0.0.1:${port}/api/oauth-callback`;
    navigator.clipboard.writeText(loopUri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="pt-2 border-t border-slate-200 mt-3 space-y-3">
      {/* Account Linked Header Status */}
      <div className={cn(
        "p-3 rounded-lg flex flex-col gap-2 transition-all duration-200 border",
        user 
          ? (driveValidationError ? "bg-amber-50/60 border-amber-200" : "bg-emerald-50/60 border-emerald-200")
          : "bg-slate-50 border-slate-200"
      )}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className={cn("w-3.5 h-3.5", user ? (driveValidationError ? "text-amber-600" : "text-emerald-600") : "text-slate-500")} />
            <span className="text-xs font-black uppercase tracking-wider text-slate-600">Google Drive Status</span>
          </div>
          {user ? (
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              {hasSavedRefreshToken && (
                <span className="text-xs bg-blue-100 text-blue-800 border border-blue-300 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">
                  Auto-Refresh Active
                </span>
              )}
              {driveValidationError ? (
                <span className="text-xs bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">Disconnect and retry</span>
              ) : (
                <span className="text-xs bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">Authenticated</span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              {isPreviewEnv ? (
                <button
                  type="button"
                  onClick={handleLaunchPlaygroundPopup}
                  className="py-0.5 px-2 text-xs font-black uppercase tracking-wider bg-blue-600 hover:bg-blue-500 text-white border border-blue-600 rounded transition-colors duration-150 flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <span>1. Launch Google Sign-In</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleLaunchAutopilot}
                  disabled={isPollingExternal || !googleClientId.trim()}
                  className="py-0.5 px-2 text-xs font-black uppercase tracking-wider bg-blue-600 hover:bg-blue-500 disabled:bg-slate-200 disabled:text-slate-400 text-white border border-blue-600 rounded transition-colors duration-150 flex items-center gap-1 cursor-pointer shrink-0"
                >
                  {isPollingExternal ? (
                    <>
                      <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                      <span>Connecting...</span>
                    </>
                  ) : (
                    <span>Connect</span>
                  )}
                </button>
              )}
              <span className="text-xs bg-red-100 text-red-800 border border-red-300 px-1.5 py-0.5 rounded font-black uppercase tracking-wider animate-pulse">Disconnected</span>
            </div>
          )}
        </div>

        {user ? (
          <div className="space-y-2 pt-0.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-mono text-slate-900 truncate">{user.email}</p>
                {token && (
                  <p className="text-xs font-mono text-slate-500 mt-0.5">
                    Token: {token.substring(0, 10)}...{token.substring(token.length - 10)}
                    {hasSavedRefreshToken ? ' (Persistent refresh_token saved)' : ' (60-min access_token only)'}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {hasSavedRefreshToken && (
                  <button
                    type="button"
                    onClick={handleManualRefreshNow}
                    disabled={isRefreshingToken}
                    title="Mint a fresh 60-minute access_token using your saved refresh_token"
                    className="py-1 px-2 text-xs font-black bg-white text-blue-700 border border-blue-300 hover:bg-blue-50 rounded transition-colors duration-150 uppercase tracking-wider cursor-pointer flex items-center gap-1"
                  >
                    <RefreshCw className={cn("w-3 h-3", isRefreshingToken && "animate-spin")} />
                    <span>Refresh</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAuthSignOut}
                  className="py-1 px-2.5 text-xs font-black bg-red-50 text-red-700 border border-red-300 hover:bg-red-600 hover:text-white rounded transition-colors duration-150 uppercase tracking-wider cursor-pointer"
                >
                  Disconnect
                </button>
              </div>
            </div>

            {(!hasSavedRefreshToken || driveValidationError) && (
              <div className="pt-2 border-t border-slate-200/80 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs text-slate-700 font-sans">
                    {driveValidationError
                      ? 'Replace rejected token with a Drive-authorized OAuth Playground token:'
                      : 'Stay logged in permanently without 60-minute expirations:'}
                  </span>
                  <button
                    type="button"
                    onClick={handleLaunchPlaygroundPopup}
                    className="py-1 px-2.5 text-xs font-black uppercase tracking-wider bg-white hover:bg-blue-50 text-blue-700 border border-blue-300 rounded transition-colors duration-150 flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <Globe className="w-3 h-3 text-blue-600" />
                    <span>1. Open Google Sign-In Popup (Pre-Selects Drive Scope)</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </button>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-1.5">
                  <input
                    type="password"
                    placeholder='2. Paste Step 2 "Authorization code" (4/0A...), Popup URL, or Step 2 JSON...'
                    value={localManualToken}
                    onChange={(e) => setLocalManualToken(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleApplyDirectToken();
                      }
                    }}
                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono text-slate-900 outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleApplyDirectToken}
                    className="px-2.5 py-1 text-xs font-black bg-blue-600 hover:bg-blue-500 text-white rounded uppercase tracking-wider transition cursor-pointer"
                  >
                    Save Persistent Token
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs font-sans text-slate-600 leading-normal">
            {isPreviewEnv
              ? 'Connect to Google Drive permanently using the 2-step OAuth Playground popup below.'
              : 'Connect to Google Drive.'}
          </p>
        )}
      </div>

      {/* Auth Configuration When Disconnected */}
      {!user && (
        <div className="space-y-3 pt-1">
          {isPreviewEnv ? (
            /* Option B: Streamlined Web Preview Login UI (Direct Google Account Chooser -> Paste Code or JSON) */
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-1.5 text-blue-600">
                  <Key className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <span className="text-xs font-black uppercase tracking-wider block">
                      Persistent Google Drive Login (Auto-Refreshes — No Cloud App Required)
                    </span>
                    <p className="text-xs text-slate-700 leading-relaxed font-sans">
                      Sign in once with your Google account and stay connected across sessions:
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsHelpOpen(true)}
                  className="text-xs font-black uppercase tracking-wider text-blue-600 hover:text-blue-700 cursor-pointer flex items-center gap-1 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded transition-all shrink-0"
                >
                  <HelpCircle className="w-2.5 h-2.5" />
                  <span>Help</span>
                </button>
              </div>

              <div className="p-2.5 bg-white border border-slate-200 rounded-lg space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-800">
                    Step 1: Choose your Google account (Drive scope is pre-selected automatically)
                  </span>
                  <button
                    type="button"
                    onClick={handleLaunchPlaygroundPopup}
                    className="py-1 px-3 text-xs font-black uppercase tracking-wider bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors duration-150 flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>1. Open Google Sign-In Popup</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Select your Google account and click <strong className="text-slate-800">Allow</strong>. The popup will land on OAuth Playground Step 2 with an <strong className="text-slate-800">Authorization code</strong> (<code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px]">4/0A...</code>).
                </p>
              </div>

              <div className="p-2.5 bg-white border border-slate-200 rounded-lg space-y-2">
                <label className="text-xs font-bold text-slate-800 block">
                  Step 2: Paste the <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-blue-700">Authorization code</code> (<code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px]">4/0A...</code>), Popup URL, or Step 2 JSON
                </label>
                <div className="grid grid-cols-[1fr_auto] gap-1.5">
                  <input
                    type="password"
                    placeholder='Paste "4/0A..." Authorization code, Popup URL, or Step 2 JSON...'
                    value={localManualToken}
                    onChange={(e) => setLocalManualToken(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleApplyDirectToken();
                      }
                    }}
                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono text-slate-900 outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleApplyDirectToken}
                    className="px-3 py-1 text-xs font-black bg-blue-600 hover:bg-blue-500 text-white rounded uppercase tracking-wider transition cursor-pointer"
                  >
                    2. Connect
                  </button>
                </div>
                <p className="text-xs text-slate-500 leading-normal">
                  AMP automatically exchanges the code for both an <code className="font-mono">access_token</code> and a permanent <code className="font-mono">refresh_token</code> so you stay logged in.
                </p>
              </div>
            </div>
          ) : (
            /* Desktop / Electron Full 3-Tab Options */
            <>
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-xs font-black uppercase tracking-wider text-slate-600 hover:text-slate-900 cursor-pointer flex items-center gap-1"
                >
                  <span className="text-xs text-blue-600">{showAdvanced ? "▼" : "▶"}</span>
                  <span>Advanced connection options</span>
                </button>
                {showAdvanced && (
                  <button
                    type="button"
                    onClick={() => setIsHelpOpen(true)}
                    className="text-xs font-black uppercase tracking-wider text-blue-600 hover:text-blue-700 cursor-pointer flex items-center gap-1 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded transition-all shrink-0"
                  >
                    <HelpCircle className="w-2.5 h-2.5" />
                    <span>Help</span>
                  </button>
                )}
              </div>

              {showAdvanced && (
                <div className="space-y-2.5 border-t border-slate-200 pt-2.5">
                  <div className="flex border-b border-slate-200 p-0.5 bg-slate-100 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setActiveTab('autopilot')}
                      className={cn(
                        "flex-1 py-1 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer",
                        activeTab === 'autopilot' 
                          ? "bg-white text-blue-600 shadow-sm border border-slate-200" 
                          : "text-slate-600 hover:text-slate-900"
                      )}
                    >
                      Option: Preapproved
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('manual-transfer')}
                      className={cn(
                        "flex-1 py-1 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer",
                        activeTab === 'manual-transfer' 
                          ? "bg-white text-blue-600 shadow-sm border border-slate-200" 
                          : "text-slate-600 hover:text-slate-900"
                      )}
                    >
                      Option: Copy-Paste
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('direct-token')}
                      className={cn(
                        "flex-1 py-1 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer",
                        activeTab === 'direct-token' 
                          ? "bg-white text-blue-600 shadow-sm border border-slate-200" 
                          : "text-slate-600 hover:text-slate-900"
                      )}
                    >
                      Option: Access Token
                    </button>
                  </div>

                  <div className="min-h-[140px] flex flex-col justify-between bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <AnimatePresence mode="wait">
                      {activeTab === 'autopilot' && (
                        <motion.div
                          key="autopilot"
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.15 }}
                          className="space-y-3"
                        >
                          <div className="flex items-start gap-1.5 text-blue-600">
                            <Globe className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <div className="space-y-1">
                              <span className="text-xs font-black uppercase tracking-wider block">Option: Login using OAUTH client ID</span>
                              <p className="text-xs text-slate-600 leading-relaxed font-sans">
                                With a OAUTH Client ID, AMP opens a pop-up login window. Google user email must be preapproved in that Client ID in Google OAUTH. See your admin to be added.
                              </p>
                            </div>
                          </div>

                          <div className="space-y-1.5 p-2 bg-white border border-slate-200 rounded">
                            <label className="text-xs text-slate-600 block font-black uppercase tracking-wider">Google OAuth Client ID</label>
                            <input
                              type="text"
                              placeholder="Paste google_client_id here..."
                              value={googleClientId}
                              onChange={(e) => handleClientIdChange(e.target.value)}
                              className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono text-slate-900 outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>

                          <div className="flex flex-col gap-2 pt-1 border-t border-slate-200">
                            <button
                              type="button"
                              onClick={handleLaunchAutopilot}
                              disabled={isPollingExternal || !googleClientId.trim()}
                              className="w-full py-1 text-xs font-black uppercase tracking-wider bg-blue-600 hover:bg-blue-500 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded transition-colors duration-150 flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              {isPollingExternal ? (
                                <>
                                  <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                                  <span>Polling Local Port Callback...</span>
                                </>
                              ) : (
                                <span>Login</span>
                              )}
                            </button>
                          </div>
                        </motion.div>
                      )}

                      {activeTab === 'manual-transfer' && (
                        <motion.div
                          key="manual-transfer"
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.15 }}
                          className="space-y-3"
                        >
                          <div className="flex items-start gap-1.5 text-blue-600">
                            <FileCode className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <div className="space-y-1">
                              <span className="text-xs font-black uppercase tracking-wider block text-blue-600">Option: Copy-Paste</span>
                              <p className="text-xs text-slate-600 leading-relaxed font-sans font-medium">
                                Failsafe method for restricted machines. Launches Google auth, redirects to a page where your token is displayed. Copy and paste it here.
                              </p>
                            </div>
                          </div>

                          <div className="space-y-1.5 p-2 bg-white border border-slate-200 rounded">
                            <label className="text-xs text-slate-600 block font-black uppercase tracking-wider">Google OAuth Client ID</label>
                            <input
                              type="text"
                              placeholder="Paste google_client_id here..."
                              value={googleClientId}
                              onChange={(e) => handleClientIdChange(e.target.value)}
                              className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono text-slate-900 outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>

                          <div className="grid grid-cols-[1fr_auto] gap-1.5 p-2 bg-white border border-slate-200 rounded">
                            <div className="space-y-1">
                              <label className="text-xs text-slate-600 block font-black uppercase tracking-wider">Paste Authorized Access Token</label>
                              <input
                                type="password"
                                placeholder="Paste verification token here (Bearer)..."
                                value={manualCodeToken}
                                onChange={(e) => setManualCodeToken(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleApplyManualHelperToken();
                                  }
                                }}
                                className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono text-slate-900 outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <div className="flex flex-col justify-end">
                              <button
                                type="button"
                                onClick={handleApplyManualHelperToken}
                                className="px-2.5 py-1 text-xs font-black bg-blue-600 hover:bg-blue-500 text-white rounded uppercase tracking-wider transition cursor-pointer"
                              >
                                Apply
                              </button>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={handleLaunchManualHelper}
                            disabled={!googleClientId.trim()}
                            className="w-full py-1 text-xs font-black uppercase tracking-wider bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded transition-all duration-150 flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <span>1. Get Token from Browser</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </button>

                          <div className="text-xs text-amber-800 italic font-mono leading-relaxed pt-1 bg-amber-50 border border-amber-200 rounded p-2">
                            * Note: This Copy-Paste flow is highly recommended for sandboxed test spaces or corporate terminal locations.
                          </div>
                        </motion.div>
                      )}

                      {activeTab === 'direct-token' && (
                        <motion.div
                          key="direct-token"
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.15 }}
                          className="space-y-3"
                        >
                          <div className="flex items-start gap-1.5 text-blue-600">
                            <Key className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <div className="space-y-1">
                              <span className="text-xs font-black uppercase tracking-wider block">Option: Direct Access / Refresh Token</span>
                              <p className="text-xs text-slate-700 leading-relaxed font-sans">
                                Obtain a persistent token using Google OAuth Playground:
                              </p>
                              <ol className="list-decimal pl-4 text-xs text-slate-600 space-y-1">
                                <li>
                                  In Step 1, expand <strong className="text-slate-800">Drive API v3</strong> and check <code className="bg-slate-100 px-1 py-0.5 rounded text-blue-700 font-mono text-[11px]">https://www.googleapis.com/auth/drive</code> (do <em>not</em> choose drive.appdata).
                                </li>
                                <li>Click <strong className="text-slate-800">Authorize APIs</strong> and select your Google account.</li>
                                <li>In Step 2, click <strong className="text-slate-800">Exchange authorization code for tokens</strong>.</li>
                                <li>Copy the <strong className="text-slate-800">entire JSON response</strong> (or <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px]">refresh_token</code> / <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px]">access_token</code>) and paste below.</li>
                              </ol>
                              <div className="pt-1 select-text">
                                <a
                                  href="https://developers.google.com/oauthplayground"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:text-blue-700 font-bold inline-flex items-center gap-1 underline cursor-pointer break-all"
                                >
                                  <span>Open Google OAuth Playground</span>
                                  <ExternalLink className="w-3 h-3 shrink-0" />
                                </a>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-[1fr_auto] gap-1.5 p-2 bg-white border border-slate-200 rounded">
                            <div className="space-y-1">
                              <label className="text-xs text-slate-600 block font-black uppercase tracking-wider">Step 2 JSON, refresh_token, or access_token</label>
                              <input
                                type="password"
                                placeholder="Paste Step 2 JSON response, refresh_token, or access_token..."
                                value={localManualToken}
                                onChange={(e) => setLocalManualToken(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleApplyDirectToken();
                                  }
                                }}
                                className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono text-slate-900 outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <div className="flex flex-col justify-end">
                              <button
                                type="button"
                                onClick={handleApplyDirectToken}
                                className="px-2.5 py-1 text-xs font-black bg-blue-600 hover:bg-blue-500 text-white rounded uppercase tracking-wider transition cursor-pointer"
                              >
                                Connect
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <DriveAuthHelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />

      {/* Shared Diagnostic Warning Streams */}
      {driveValidationError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 space-y-2 max-w-full">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
            <div className="space-y-1 flex-1">
              <span className="font-bold text-red-900 block uppercase tracking-wide text-[11px]">Drive Access Notice</span>
              <p className="font-sans text-xs text-red-800 leading-relaxed font-semibold">
                {driveValidationError}
              </p>
            </div>
          </div>

          <div className="pt-1 border-t border-red-200">
            <button
              type="button"
              onClick={() => setShowTroubleshooting(!showTroubleshooting)}
              className="flex items-center gap-1 font-bold text-red-700 text-xs cursor-pointer text-left focus:outline-none"
            >
              <span className="text-xs text-red-600 shrink-0">{showTroubleshooting ? "▼" : "▶"}</span>
              <span>Additional troubleshooting notes</span>
            </button>
            
            {showTroubleshooting && (
              <div className="space-y-2 pt-2 text-slate-600 leading-relaxed">
                <ul className="list-disc pl-4 space-y-1 text-xs">
                  <li>
                    <strong className="text-slate-800">OAuth Playground Scopes:</strong> Make sure <code className="bg-slate-100 border border-slate-300 px-1 py-0.2 rounded font-mono text-xs">https://www.googleapis.com/auth/drive</code> is authorized. The restricted <code className="bg-slate-100 border border-slate-300 px-1 py-0.2 rounded font-mono text-xs">drive.appdata</code> scope will not permit reading your shared media folders.
                  </li>
                  <li>
                    <strong className="text-slate-800">Persistent Login:</strong> Pasting the full Step 2 JSON from OAuth Playground saves your <code className="bg-slate-100 border border-slate-300 px-1 py-0.2 rounded font-mono text-xs">refresh_token</code> so AMP automatically renews expired tokens in the background.
                  </li>
                  <li>
                    <strong className="text-slate-800">Authorized Origins:</strong> Whitelist <code className="bg-slate-100 border border-slate-300 px-1 py-0.2 rounded font-mono select-all text-xs">{window.location.origin}</code> in your Google Cloud platform credentials settings if using custom OAuth Client IDs.
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default GoogleAuthSection;
