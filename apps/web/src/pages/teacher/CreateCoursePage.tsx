import { useNavigate } from "react-router-dom";
import { CreateActivityForm } from "./ActivityConfigPage";

export function CreateCoursePage() {
  const navigate = useNavigate();

  return (
    <div className="card">
      <CreateActivityForm
        onCreated={(created) => navigate(`/teacher/courses/${created.activityId}/configure`)}
        onCancel={() => navigate("/")}
      />
    </div>
  );
}
