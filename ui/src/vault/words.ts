// Word list for passphrases: short, common, easy-to-type English words. Duplicates are removed at load, and the
// generator measures entropy from the real list size, so adding words only makes passphrases stronger.
const RAW = `
able acid acorn actor adapt adobe agent agile alarm album alert alien alley alpha amber ample angel anger angle ankle
apple apron arena argue armor army arrow atlas atom attic audio autumn avoid awake award axis bacon badge bagel baker
balmy bamboo banjo barn basil basin batch beach beard beast begin bench berry bike bingo birch bison black blade blank
blast blaze blend bloom blues blunt board boat bonus boost booth boss bowl brain brave bread brick bride brief brook
broom brush buddy bugle build bulb bunch cabin cable cacao cadet camel camp canal candy canoe canon cargo carol carpet
carve cedar chain chair chalk champ chant charm chart chase cheek chef cherry chess chest chief chili chime chip choir
cider cinema civic claim clamp clash clay clerk click cliff climb clock cloud clover coach coast cobra cocoa comet coral
cotton couch cough crane crate crisp crown crumb crush curve cycle daily daisy dance dealer decoy delta denim depot
desk diary diner disco ditch diver dizzy dock dodge dome donor donut dough draft dragon drama dream dress drift drill
drum dune dusk eagle early earth easel ebony echo eclipse edge elbow elder elite ember empty enjoy entry envoy epic equal
erase essay ethic event exact exile extra fable facet fairy faith false fancy fargo feast fence ferry fiber field fifth
final flame flash fleet flint float flock flora flour fluid flute focus foggy forest forge fork forum fossil fox frame
fresh frost fruit fudge fungi gamma garden gauge gecko genie ghost giant ginger glade glass globe glory glove glow gold
golf grace grain grape graph grass gravy green grill grove guard guest guide guitar habit hammer happy harbor harp haven
hazel heart hedge helix hello herbs hero hiker hinge hippo hobby honey hood horse hotel humor husky igloo image inbox
index inlet input iris iron island ivory jacket jaguar jelly jewel jockey joker jolly judge juice jumbo jungle kayak
kebab kettle khaki kiosk kitten kiwi knack knife koala label lace ladder lagoon lake lamp lane laser latch lemon level
lever light lilac limit linen lion liver llama lobby lodge logic lotus lucky lunar lunch lyric macro magic magnet maize
major mango manor maple marble march marsh mason meadow medal melon mercy merit metal meter mile mimic minor mint mirror
mocha model molar money moose morse moss motel motor mouse movie mural music nacho navy nectar nerve nest night ninja
noble noise north notch novel nylon oasis ocean olive omega onion opera orbit orchid organ otter outer owl oxide oyster
paddle pagoda palm panda panel paper parade parka party pasta patio pause peach pearl pecan pedal penny pepper perch
piano pickle pilot pinch pine pixel pizza plaza plum polar pond poppy porch posse potato pouch prism prize proof pulse
pump puppy quail quart queen quest quick quiet quilt quota rabbit radar radio rain ranch raven razor recap reef relay
relic remix rhino ribbon rider ridge rifle rival river roast robin robot rocket rodeo rose rover royal ruby rugby ruler
saddle safari salad salmon salsa sandy satin sauce scarf scene scout sedan seed shade shark shell shore siren sketch
skier slate sleet slope smile smoke snack snail solar sonic spark spice spoon sport spray squid stamp star steam steel
stone storm stove straw sugar suite sunny surf swamp swan sweet swift syrup table taco talon tango tapir taxi teapot
tempo tennis thorn thumb tiger timber toast token topaz torch tower toxic trail train trend tribe trout truck tulip
tundra tuner turbo turtle tutor twist ultra umbra uncle union unity urban usher valid valve vapor vault velvet venom
venue verse video villa vinyl viola viper visor vista vivid vocal voice voter wafer wagon walnut walrus waltz water
whale wheat whisk widget willow window wizard wolf wombat world woven yacht yeast yodel yogurt young zebra zesty zinc
zippy zone acre alto anvil aspen bayou beacon blimp bolt bongo cactus cameo canyon cello cobalt condor cosmos crater
dingo domino ferret fjord gadget galaxy garnet geyser glacier gopher granite hamlet harvest hawk heron jasper jigsaw
kernel lantern lemur lichen locket magma mantis marlin meteor mosaic nebula nickel nomad nugget oboe onyx opal osprey
panther parrot pebble pelican pewter pigeon pistachio planet plasma pollen puffin pumice quartz quokka raccoon radish
rapids reptile saffron sapphire sequoia sherpa sierra sloth sparrow sphinx spruce summit tandem thistle thunder toucan
trellis trumpet tuxedo vanilla violet walrus wasabi yonder zenith
`;

export const WORDS: readonly string[] = [...new Set(RAW.split(/\s+/).filter(Boolean))];
