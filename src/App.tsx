import { useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import PinLock, { isPinUnlocked } from "@/components/PinLock";
import MainChat from "@/pages/MainChat";
import Tasks from "@/pages/Tasks";
import Commands from "@/pages/Commands";
import MixNotes from "@/pages/MixNotes";
import TimeTrack from "@/pages/TimeTrack";
import Scorecard from "@/pages/Scorecard";
import MorningBriefing from "@/pages/MorningBriefing";
import WrapUp from "@/pages/WrapUp";
import MessageToDad from "@/pages/MessageToDad";
import SomedayReview from "@/pages/SomedayReview";
import SessionHistory from "@/pages/SessionHistory";
import DataExport from "@/pages/DataExport";
import Triage from "@/pages/Triage";
import Session from "@/pages/Session";
import Journal from "@/pages/Journal";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={MainChat} />
      <Route path="/brain-dump" component={Tasks} />
      <Route path="/commands" component={Commands} />
      <Route path="/mix-notes" component={MixNotes} />
      <Route path="/time-track" component={TimeTrack} />
      <Route path="/scorecard" component={Scorecard} />
      <Route path="/morning-briefing" component={MorningBriefing} />
      <Route path="/wrap-up" component={WrapUp} />
      <Route path="/message-to-dad" component={MessageToDad} />
      <Route path="/someday-review" component={SomedayReview} />
      <Route path="/session-history" component={SessionHistory} />
      <Route path="/data-export" component={DataExport} />
      <Route path="/triage" component={Triage} />
      <Route path="/session" component={Session} />
      <Route path="/journal" component={Journal} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [unlocked, setUnlocked] = useState(isPinUnlocked);

  if (!unlocked) {
    return <PinLock onUnlock={() => setUnlocked(true)} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
