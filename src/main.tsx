import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import { ErrorBoundary } from "./app/components/shared/ErrorBoundary.tsx";
import "./styles/index.css";

/*
 * Wrapped at the very root, above the router.
 *
 * A render that throws with nothing catching it unmounts the whole tree, and
 * what is left is a blank page with no way forward but closing the app. The
 * boundary turns that into a sentence and a reload button.
 */
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
