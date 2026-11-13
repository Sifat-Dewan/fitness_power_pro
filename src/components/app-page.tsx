"use client";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import { SkeletonPage } from "./ui";
// Load each section only when it is visited; avoid shipping charts to member/locker pages.
const Dashboard=dynamic(()=>import("./dashboard").then(m=>m.Dashboard),{loading:()=> <SkeletonPage/>});
const MembersPage=dynamic(()=>import("./members").then(m=>m.MembersPage),{loading:()=> <SkeletonPage/>});
const AttendancePage=dynamic(()=>import("./attendance").then(m=>m.AttendancePage),{loading:()=> <SkeletonPage/>});
const PlansPage=dynamic(()=>import("./operations").then(m=>m.PlansPage),{loading:()=> <SkeletonPage/>});
const StaffPage=dynamic(()=>import("./operations").then(m=>m.StaffPage),{loading:()=> <SkeletonPage/>});
const PaymentsPage=dynamic(()=>import("./operations").then(m=>m.PaymentsPage),{loading:()=> <SkeletonPage/>});
const ExpensesPage=dynamic(()=>import("./operations").then(m=>m.ExpensesPage),{loading:()=> <SkeletonPage/>});
const LockersPage=dynamic(()=>import("./lockers").then(m=>m.LockersPage),{loading:()=> <SkeletonPage/>});
const ReportsPage=dynamic(()=>import("./insights").then(m=>m.ReportsPage),{loading:()=> <SkeletonPage/>});
const ActivityPage=dynamic(()=>import("./insights").then(m=>m.ActivityPage),{loading:()=> <SkeletonPage/>});
const SettingsPage=dynamic(()=>import("./system").then(m=>m.SettingsPage),{loading:()=> <SkeletonPage/>});
const LegacyLedgerPage=dynamic(()=>import("./legacy-ledger").then(m=>m.LegacyLedgerPage),{loading:()=> <SkeletonPage/>});
const TeamPage=dynamic(()=>import("./system").then(m=>m.TeamPage),{loading:()=> <SkeletonPage/>});
type Section="dashboard"|"members"|"attendance"|"plans"|"payments"|"lockers"|"staff"|"expenses"|"reports"|"activity"|"team"|"settings"|"legacy-ledger";
export function AppPage({section}:{section:Section}){
  const component={dashboard:<Dashboard/>,members:<MembersPage/>,attendance:<AttendancePage/>,plans:<PlansPage/>,payments:<PaymentsPage/>,lockers:<LockersPage/>,staff:<StaffPage/>,expenses:<ExpensesPage/>,reports:<ReportsPage/>,activity:<ActivityPage/>,team:<TeamPage/>,settings:<SettingsPage/>,"legacy-ledger":<LegacyLedgerPage/>}[section];
  return <Suspense fallback={<SkeletonPage/>}>{component}</Suspense>;
}
