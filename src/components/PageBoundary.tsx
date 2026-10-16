import { Component, Suspense, type ReactNode } from "react";

import { AppShell } from "./AppShell";

export class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <AppShell>
          <section className="page-intro" role="alert">
            <div>
              <h1>页面加载失败</h1>
              <p>请检查网络后重新加载。</p>
              <button className="primary-button" onClick={() => window.location.reload()}>
                重新加载
              </button>
            </div>
          </section>
        </AppShell>
      );
    }
    return (
      <Suspense fallback={(
        <AppShell>
          <section className="page-intro" role="status" aria-live="polite">
            <p>正在加载页面…</p>
          </section>
        </AppShell>
      )}>
        {this.props.children}
      </Suspense>
    );
  }
}
