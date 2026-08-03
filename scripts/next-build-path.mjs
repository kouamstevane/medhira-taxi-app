export function getNextBuildDirectory({ isMobile = false } = {}) {
    return isMobile ? '.next-mobile' : '.next';
}

export function getStaticExportDirectory({ isMobile = false } = {}) {
    return isMobile ? getNextBuildDirectory({ isMobile: true }) : 'out';
}
