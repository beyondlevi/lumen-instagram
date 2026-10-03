import {App} from '@wearables-ui-toolkit/mrbd';
import {ReactRouterNavigationProvider, ReactRouterPageTransition} from '@wearables-ui-toolkit/mrbd/react-router';
import {BrowserRouter, Navigate, Route, Routes} from 'react-router-dom';
import {useInstagram} from './InstagramProvider';
import {CommentsPage} from './pages/CommentsPage';
import {HomePage} from './pages/HomePage';
import {OpenPage} from './pages/OpenPage';
import {PhotoPage} from './pages/PhotoPage';
import {PlayPage} from './pages/PlayPage';
import {RecordPage} from './pages/RecordPage';
import {SendPage} from './pages/SendPage';
import {StatusPage} from './pages/StatusPage';
import {ThreadPage} from './pages/ThreadPage';
import {TranscriptPage} from './pages/TranscriptPage';

// Back (Escape) is handled by ReactRouterNavigationProvider: each route goes
// back to the one that opened it; on the home pager, with no history left, it
// is not consumed, so the platform closes the app. A paused reel takes Back
// first (it resumes).
export default function InstagramApp() {
  const {phase} = useInstagram();
  return (
    <BrowserRouter>
      <ReactRouterNavigationProvider>
        <App>
          {phase.kind !== 'ready' ? (
            <StatusPage phase={phase} />
          ) : (
            <ReactRouterPageTransition>
              {({location}) => (
                <Routes location={location}>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/reel/:reelId/comments" element={<CommentsPage />} />
                  <Route path="/reel/:reelId/send" element={<SendPage />} />
                  <Route path="/direct/:threadId" element={<ThreadPage />} />
                  <Route path="/direct/:threadId/record" element={<RecordPage />} />
                  <Route path="/direct/:threadId/transcript/:messageId" element={<TranscriptPage />} />
                  <Route path="/direct/:threadId/play/:messageId" element={<PlayPage />} />
                  <Route path="/direct/:threadId/photo/:messageId" element={<PhotoPage />} />
                  <Route path="/open/:title" element={<OpenPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              )}
            </ReactRouterPageTransition>
          )}
        </App>
      </ReactRouterNavigationProvider>
    </BrowserRouter>
  );
}
