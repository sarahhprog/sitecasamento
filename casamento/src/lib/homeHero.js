export const defaultHomeHero = {
  backgroundType: 'color',
  backgroundColor: '#5C6B2D',
  imageUrl: '',
  imagePath: '',
  imageSize: 'cover',
  overlay: true,
}

function getTextColor(backgroundColor) {
  const match = /^#([\da-f]{6})$/i.exec(backgroundColor || '')
  if (!match) return '#F4F0E7'
  const channels = match[1].match(/.{2}/g).map((channel) => parseInt(channel, 16) / 255)
  const luminance = channels
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0)
  return luminance > 0.4 ? '#292824' : '#F4F0E7'
}

export function getHomeHeroBackgroundStyle(homeHero = defaultHomeHero, imagePreview = '') {
  const imageUrl = imagePreview || homeHero.imageUrl
  const useImage = homeHero.backgroundType === 'image' && imageUrl

  if (!useImage) {
    return {
      backgroundColor: homeHero.backgroundColor || defaultHomeHero.backgroundColor,
      backgroundImage: 'none',
      '--hero-text-color': getTextColor(homeHero.backgroundColor || defaultHomeHero.backgroundColor),
    }
  }

  return {
    backgroundColor: '#F4F0E7',
    backgroundImage: `linear-gradient(180deg, rgba(31, 39, 17, .46), rgba(31, 39, 17, .56)), url(${JSON.stringify(imageUrl)})`,
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    backgroundSize: `100% 100%, ${homeHero.imageSize === 'contain' ? 'contain' : 'cover'}`,
    '--hero-text-color': '#F4F0E7',
  }
}
