import React from 'react';
import './Avatar.css';

function Avatar({ size = 'large' }) {
  const avatarStyle = {
    width: size === 'small' ? '100px' : '200px',
    height: size === 'small' ? '100px' : '200px',
    borderRadius: '50%',
    background: '#9ecedb',
    animation: 'float 3s ease-in-out infinite',
  };

  return <div style={avatarStyle}></div>;
}

export default Avatar;
