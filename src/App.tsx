import { useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import ErrorBoundary from "@/components/ErrorBoundary";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import PinLock, { isPinUnlocked } from "@/components/PinLock";
import MainChat from "@/pages/MainChat";
import Tasks from "@/pages/Tasks";
import ProjectDetail from "@/pages/ProjectDetail";
import Commands from "@/pages/Commands";
import MixNotes from "@/pages/MixNotes";
import ComposingTools from "@/pages/ComposingTools";
import TimeTrack from "@/pages/TimeTrack";
import Scorecard from "@/pages/Scorecard";
import MorningBriefing from "@/pages/MorningBriefing";
import MessageToDad from "@/pages/MessageToDad";
import SomedayReview from "@/pages/SomedayReview";
import Triage from "@/pages/Triage";
import Session from "@/pages/Session";
import Journal from "@/pages/Journal";
import Scheduler from "@/pages/Scheduler";
import ShoppingList from "@/pages/ShoppingList";
import SongPipeline from "@/pages/SongPipeline";
import CallNotes from "@/pages/CallNotes";
import ContentPipeline from "@/pages/ContentPipeline";
import QuickLinks from "@/pages/QuickLinks";
import Exercise from "@/pages/Exercise";
import Reminders from "@/pages/Reminders";
import PersonalMemory from "@/pages/PersonalMemory";
import JarvisKnowledge from "@/pages/JarvisKnowledge";
import WrapUp from "@/pages/WrapUp";
import SanityCheck from "@/pages/SanityCheck";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  // Key the boundary to the current path so navigating to a new route
  // clears a caught error without requiring a full reload.
  const [location] = useLocation();
  return (
    <ErrorBoundary key={location}>
    <Switch>
      <Route path="/" component={MainChat} />
      <Route path="/tasks" component={Tasks} />
      <Route path="/projects/:id" component={ProjectDetail} />
      <Route path="/commands" component={Commands} />
      <Route path="/mix-notes" component={MixNotes} />
      <Route path="/composing-tools" component={ComposingTools} />
      <Route path="/time-track" component={TimeTrack} />
      <Route path="/scorecard" component={Scorecard} />
      <Route path="/morning-briefing" component={MorningBriefing} />
      <Route path="/message-to-dad" component={MessageToDad} />
      <Route path="/someday-review" component={SomedayReview} />
      <Route path="/triage" component={Triage} />
      <Route path="/session" component={Session} />
      <Route path="/journal" component={Journal} />
      <Route path="/scheduler" component={Scheduler} />
      <Route path="/shopping-list" component={ShoppingList} />
      <Route path="/song-pipeline" component={SongPipeline} />
      <Route path="/call-notes" component={CallNotes} />
      <Route path="/content" component={ContentPipeline} />
      <Route path="/links" component={QuickLinks} />
      <Route path="/exercise" component={Exercise} />
      <Route path="/reminders" component={Reminders} />
      <Route path="/personal-memory" component={PersonalMemory} />
      <Route path="/jarvis-knowledge" component={JarvisKnowledge} />
      <Route path="/wrap-up" component={WrapUp} />
      <Route path="/sanity-check" component={SanityCheck} />
      <Route component={NotFound} />
    </Switch>
    </ErrorBoundary>
  );
}

function App() {
  const [unlocked, setUnlocked] = useState(isPinUnlocked);

  // Periodic 5-minute check — re-gates PIN if 4 hours have elapsed since unlock
  useEffect(() => {
    if (!unlocked) return;
    const id = setInterval(() => {
      if (!isPinUnlocked()) setUnlocked(false);
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [unlocked]);

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
