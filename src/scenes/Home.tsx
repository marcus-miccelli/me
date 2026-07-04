import { Canvas } from '@react-three/fiber';
import ColorBends from '../components/ColorBends';
import Orb from '../components/Orb';

export default function Home() {
    return (
        <Canvas className='background'>
            <ColorBends/>
            <Orb/>
        </Canvas>
    )
}