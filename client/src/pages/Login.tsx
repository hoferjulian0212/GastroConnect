// Legacy login route — redirected to the Clerk sign-in page in App.tsx.
// This component is kept as a fallback but should never be rendered directly.
import { Redirect } from "wouter";

export default function Login() {
  return <Redirect to="/sign-in" />;
}
