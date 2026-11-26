import { redirect } from "next/navigation";
import { isStaff } from "../../../src/server/auth";
import GroupRequests from "./GroupRequests";

export const dynamic = "force-dynamic";

export default async function StaffGroupsPage() {
  if (!(await isStaff())) redirect("/staff/login");
  return <GroupRequests />;
}
