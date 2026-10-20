import { AuthGate } from "@/components/auth-gate";

export default function OpsLayout({ children }: LayoutProps<"/">) {
  return <AuthGate>{children}</AuthGate>;
}
