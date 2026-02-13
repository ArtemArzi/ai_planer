import { InboxStack } from "../components/InboxStack";
import { TodayList } from "../components/TodayList";
import { UpcomingList } from "../components/UpcomingList";

export function FocusTab() {
  return (
    <div className="mx-auto w-full max-w-2xl pb-36 pt-4">
      <InboxStack />
      <TodayList />
      <UpcomingList />
    </div>
  );
}
