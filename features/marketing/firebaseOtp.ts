// Firebase Phone Auth for /dealer's OTP step (DECISIONS R24). Imported ONLY by DealerOtpStep.tsx, which the form
// loads with next/dynamic once an application is saved, so no other page and no first load of /dealer carries
// the Firebase SDK. Browser only.
//
// - Its own named app with in-memory persistence: nothing is stored in the browser, and the session is signed
//   out as soon as the ID token is read (the token is all the server needs; Firebase is not our login).
// - Invisible reCAPTCHA, re-created in a fresh element after a failure (a used container can't render again).
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  initializeAuth,
  inMemoryPersistence,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut,
  type Auth,
  type ConfirmationResult,
} from "firebase/auth";
import { OtpError, otpErrorCode, type FirebaseWebConfig } from "./otp";

const APP_NAME = "molbhav-dealer-otp";
let auth: Auth | null = null;

function authFor(config: FirebaseWebConfig): Auth {
  if (auth !== null) return auth;
  const app = getApps().some((a) => a.name === APP_NAME) ? getApp(APP_NAME) : initializeApp(config, APP_NAME);
  auth = initializeAuth(app, { persistence: inMemoryPersistence });
  return auth;
}

const toOtpError = (e: unknown) => (e instanceof OtpError ? e : new OtpError(otpErrorCode((e as { code?: unknown } | null)?.code)));

export interface OtpSession {
  /** Sends the SMS to a +91 number. Throws OtpError. */
  send(phoneE164: string): Promise<void>;
  /** Checks the six digits and returns the Firebase ID token. Throws OtpError. */
  confirm(code: string): Promise<string>;
  dispose(): void;
}

export function createOtpSession(config: FirebaseWebConfig, container: HTMLElement, lang: "hi" | "en"): OtpSession {
  const a = authFor(config);
  a.languageCode = lang;
  let verifier: RecaptchaVerifier | null = null;
  let confirmation: ConfirmationResult | null = null;

  const resetVerifier = () => {
    verifier?.clear();
    verifier = null;
  };

  return {
    async send(phoneE164) {
      resetVerifier();
      const el = document.createElement("div");
      container.replaceChildren(el);
      verifier = new RecaptchaVerifier(a, el, { size: "invisible" });
      try {
        confirmation = await signInWithPhoneNumber(a, phoneE164, verifier);
      } catch (e) {
        resetVerifier();
        throw toOtpError(e);
      }
    },
    async confirm(code) {
      if (confirmation === null) throw new OtpError("expired");
      try {
        const cred = await confirmation.confirm(code);
        const token = await cred.user.getIdToken();
        await signOut(a).catch(() => undefined);
        return token;
      } catch (e) {
        throw toOtpError(e);
      }
    },
    dispose() {
      resetVerifier();
      confirmation = null;
      void signOut(a).catch(() => undefined);
    },
  };
}
