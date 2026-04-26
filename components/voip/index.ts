/**
 * Index des composants VoIP
 * Exporte tous les composants et hooks relatifs aux appels vocaux
 */

// Composants
export { CallButton } from './CallButton';
export { IncomingCallModal } from './IncomingCallModal';
export { ActiveCallScreen } from './ActiveCallScreen';
export { VoipProvider, useVoipProvider } from './VoipProvider';

// Types
export type {
  CallStatus,
  CallEndReason,
  CallerMetadata,
  VoipCall,
  CreateCallParams,
  CreateCallResult,
  LocalCallState,
  AgoraConfig,
  CallQualityMetrics,
  CallLifecycleEvent,
  VoipPermissions,
  VoipPermissionStatus
} from '../../src/types/voip';

// Hooks
export { useVoipCall } from '../../hooks/useVoipCall';
export type { UseVoipCallReturn } from '../../hooks/useVoipCall';

// Services
export { voipService } from '../../src/services/voip.service';

// Constantes
export { DEFAULT_CALL_TIMEOUTS } from '../../src/types/voip';
