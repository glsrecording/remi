import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches render-time exceptions in the subtree and shows a recoverable
 * fallback instead of unmounting the whole React tree (which left the PWA
 * as a blank shell only recoverable by closing and reopening).
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 24,
          textAlign: "center",
          background: "var(--t-bg)",
          color: "var(--t-text)",
          fontFamily: "inherit",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
          Something went wrong
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "var(--t-text3)",
            maxWidth: 420,
            margin: 0,
            wordBreak: "break-word",
          }}
        >
          {this.state.error?.message || "An unexpected error occurred."}
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 20px",
              borderRadius: 10,
              border: "none",
              background: "#f5a623",
              color: "#1a1a1a",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
          <a
            href="/"
            style={{
              padding: "10px 20px",
              borderRadius: 10,
              border: "1px solid var(--t-border-lg)",
              background: "transparent",
              color: "var(--t-text)",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            Back to home
          </a>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
