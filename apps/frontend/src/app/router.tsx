import { createBrowserRouter } from "react-router";

export const router = createBrowserRouter([
  { path: "/", element: <div className="p-6">SteamX LMS</div> },
  { path: "*", element: <div className="p-6">Page not found</div> },
]);