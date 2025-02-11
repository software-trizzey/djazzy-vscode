import { UserSession } from '../common/auth/github';
import { MIGRATION_REMINDER } from '../common/constants';

const TWENTY_FOUR_HOURS_IN_MS = 24 * 60 * 60 * 1000;

export const mockValidUserSession: UserSession = {
    token: 'test-token',
    user: {
        has_agreed_to_terms: true,
        id: 'test-user-id',
        email: 'test@example.com',
        github_login: 'test-github-login'
    },
    session: {
        id: 1,
        key: 'test-session-key',
        created_at: new Date().toISOString(),
        expires_at: new Date(
			Date.now() + MIGRATION_REMINDER.COOLDOWN_HOURS * 60 * 60 * 1000
		).toISOString()
    },
    migration_notice: 'test-migration-notice'
};

export const mockExpiredUserSession: UserSession = {
    ...mockValidUserSession,
    session: {
        ...mockValidUserSession.session,
        expires_at: new Date(
			Date.now() - TWENTY_FOUR_HOURS_IN_MS
		).toISOString()
    }
};
