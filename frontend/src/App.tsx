import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "@/components/Layout";
import SettingsPage from "@/pages/SettingsPage";
import JDPage from "@/pages/JDPage";
import ResumePage from "@/pages/ResumePage";
import ScorePage from "@/pages/ScorePage";
import TailorPage from "@/pages/TailorPage";
import ProjectsPage from "@/pages/ProjectsPage";
import EmailPage from "@/pages/EmailPage";
import DownloadPage from "@/pages/DownloadPage";
import DriveCallbackPage from "@/pages/DriveCallbackPage";

export default function App() {
  return (
    <Routes>
      {/* OAuth callback — outside Layout (opens in popup) */}
      <Route path="/drive-callback" element={<DriveCallbackPage />} />
      <Route element={<Layout />}>
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/jd" element={<JDPage />} />
        <Route path="/resume" element={<ResumePage />} />
        <Route path="/score" element={<ScorePage />} />
        <Route path="/tailor" element={<TailorPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/email" element={<EmailPage />} />
        <Route path="/download" element={<DownloadPage />} />
        <Route path="*" element={<Navigate to="/settings" replace />} />
      </Route>
    </Routes>
  );
}
