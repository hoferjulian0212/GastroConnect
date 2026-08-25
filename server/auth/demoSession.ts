/**
 * Demo sign-in is deliberately separate from platform-admin impersonation.
 * Rotating the express session removes any adminId / impersonatedMemberId
 * before the browser activates the selected demo member's Clerk session.
 */
export function resetSessionForDemoLogin(session: {
  regenerate(callback: (error?: Error | null) => void): void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    session.regenerate((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}