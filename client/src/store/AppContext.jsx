import React, { createContext, useContext, useEffect, useReducer, useCallback } from 'react';
import { api } from '../services/api.js';

const AppContext = createContext(null);

const initialState = {
  sessionId: null,
  skillName: null,
  status: null,
  state: null,
  messages: [],
  pendingTool: null,
  interview: null,
  finalSuggestion: null,
  error: null,
  busy: false,
  skills: [],
};

function reducer(state, action) {
  switch (action.type) {
    case 'SESSION':
      return {
        ...state,
        sessionId: action.payload.sessionId,
        skillName: action.payload.skillName,
        status: action.payload.status,
        state: action.payload.state,
        messages: action.payload.messages,
        pendingTool: action.payload.pendingTool,
        interview: action.payload.interview,
        finalSuggestion: action.payload.finalSuggestion,
        error: null,
        busy: false,
      };
    case 'SKILLS':
      return { ...state, skills: action.payload };
    case 'RESET':
      return { ...initialState, skills: state.skills };
    case 'BUSY':
      return { ...state, busy: true, error: null };
    case 'ERROR':
      return { ...state, busy: false, error: action.payload };
    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    api
      .listSkills()
      .then((skills) => dispatch({ type: 'SKILLS', payload: skills }))
      .catch(() => {});
  }, []);

  const startSession = useCallback(async (skillName = 'auto') => {
    dispatch({ type: 'BUSY' });
    try {
      const session = await api.startSession(skillName);
      dispatch({ type: 'SESSION', payload: session });
    } catch (error) {
      dispatch({ type: 'ERROR', payload: error.message });
    }
  }, []);

  const changeSkill = useCallback(
    async (skillName) => {
      dispatch({ type: 'BUSY' });
      try {
        const session = await api.startSession(skillName);
        dispatch({ type: 'SESSION', payload: session });
      } catch (error) {
        dispatch({ type: 'ERROR', payload: error.message });
      }
    },
    [],
  );

  const sendMessage = useCallback(
    async (message) => {
      if (!state.sessionId) return;
      dispatch({ type: 'BUSY' });
      try {
        const session = await api.act(state.sessionId, message);
        dispatch({ type: 'SESSION', payload: session });
      } catch (error) {
        dispatch({ type: 'ERROR', payload: error.message });
      }
    },
    [state.sessionId],
  );

  const submitResult = useCallback(
    async (userResult) => {
      if (!state.sessionId) return;
      dispatch({ type: 'BUSY' });
      try {
        const session = await api.feedback(state.sessionId, userResult);
        dispatch({ type: 'SESSION', payload: session });
      } catch (error) {
        dispatch({ type: 'ERROR', payload: error.message });
      }
    },
    [state.sessionId],
  );

  const resetSession = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  const value = {
    state,
    dispatch,
    startSession,
    changeSkill,
    sendMessage,
    submitResult,
    resetSession,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  return useContext(AppContext);
}
