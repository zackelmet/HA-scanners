// Mock firebase/auth's onAuthStateChanged to verify forwarding
jest.mock("firebase/auth", () => ({
  onAuthStateChanged: jest.fn((auth: any, cb: any) => {
    // call callback once with null to simulate signed-out state
    cb(null);
    return "UNSUBSCRIBE_TOKEN";
  }),
}));

// Prevent firebase client initialization side-effects in Node test env
jest.mock("../lib/firebase/firebaseClient", () => ({
  auth: {},
  db: {},
}));

import { AuthService } from "../lib/auth/AuthService";
import { onAuthStateChanged } from "firebase/auth";

describe("AuthService", () => {
  test("onAuthStateChanged forwards to firebase onAuthStateChanged", () => {
    const svc = new AuthService();
    const rv = svc.onAuthStateChanged(() => {});
    expect(rv).toBe("UNSUBSCRIBE_TOKEN");
    expect(onAuthStateChanged).toHaveBeenCalled();
  });
});
