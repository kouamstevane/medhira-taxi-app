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
  CallTimeoutConfig,
  VoipPermissions,
  VoipPermissionStatus
} from '../../types/voip';

// Hooks
export { useVoipCall } from '../../hooks/useVoipCall';
export type { UseVoipCallReturn } from '../../hooks/useVoipCall';

// Services
export { agoraService } from '../../services/voip/AgoraService';
export { AgoraService } from '../../services/voip/AgoraService';

export { signalingService } from '../../services/voip/SignalingService';
export { SignalingService } from '../../services/voip/SignalingService';

// Constantes
export { DEFAULT_CALL_TIMEOUTS } from '../../types/voip';
