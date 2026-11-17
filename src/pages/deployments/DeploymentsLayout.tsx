import SectionLayout from "@/layouts/SectionLayout";

const DEPLOYMENT_TABS = [
  { label: "Deployment Definitions", path: "management" },
  { label: "Target Rules", path: "target-rules" },
  { label: "Deployment Executions", path: "executions" },
  { label: "History", path: "history" },
];

export default function DeploymentsLayout() {
  return <SectionLayout tabs={DEPLOYMENT_TABS} />;
}
