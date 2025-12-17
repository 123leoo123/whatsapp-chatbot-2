type SessionData = {
  lastProductId?: string;
};

const sessions = new Map<string, SessionData>();

export const setLastProduct = (user: string, productId: string) => {
  sessions.set(user, { lastProductId: productId });
};

export const getLastProduct = (user: string) => {
  return sessions.get(user)?.lastProductId;
};
