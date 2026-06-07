export const UnifiedPrivacyConfig = {
  // Technology selection based on use case
  useCaseMapping: {
    SCHEDULE_CREATION: {
      primary: ['TEE', 'ZKP'],
      secondary: ['BLOCKCHAIN_PRIVACY'],
      epsilon: null,
    },
    SCHEDULE_OPTIMIZATION: {
      primary: ['HE', 'MPC'],
      secondary: ['DIFFERENTIAL_PRIVACY'],
      epsilon: 0.5,
    },
    SCHEDULE_SHARING: {
      primary: ['BLOCKCHAIN_PRIVACY', 'ZKP'],
      secondary: ['TEE'],
      epsilon: null,
    },
    ANALYTICS: {
      primary: ['DIFFERENTIAL_PRIVACY'],
      secondary: ['HE'],
      epsilon: 0.1,
    },
    VERIFICATION: {
      primary: ['VC', 'ZKP'],
      secondary: ['BLOCKCHAIN_PRIVACY'],
      epsilon: null,
    },
  },
  
  // Privacy level definitions
  privacyLevels: {
    STANDARD: {
      technologies: ['DIFFERENTIAL_PRIVACY'],
      epsilon: 1.0,
      performanceOverhead: '1.1x',
    },
    HIGH: {
      technologies: ['ZKP', 'HE'],
      epsilon: 0.5,
      performanceOverhead: '10x',
    },
    MAXIMUM: {
      technologies: ['TEE', 'MPC', 'BLOCKCHAIN_PRIVACY', 'ZKP', 'HE', 'VC'],
      epsilon: 0.01,
      performanceOverhead: '100x',
    },
  },
};