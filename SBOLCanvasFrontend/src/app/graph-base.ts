import * as mxEditor from 'mxgraph';
import * as mxGraph from 'mxgraph';
import * as mxCell from 'mxgraph';
import { GlyphInfo } from './glyphInfo';
import { InteractionInfo } from './interactionInfo';
import { GlyphService } from './glyph.service';
import { CanvasAnnotation } from './canvasAnnotation';
import { environment } from 'src/environments/environment';
import { ModuleInfo } from './moduleInfo';
import { GraphEdits } from './graph-edits';

// mx is used here as the typings file for mxgraph isn't up to date.
// Also if it weren't exported, other classes wouldn't get our extensions of the mxCell class.
declare var require: any;
export const mx = require('mxgraph')({
    mxImageBasePath: 'mxgraph/images',
    mxBasePath: 'mxgraph'
});

/**
 * The base class that represents our mxGraph. Primarily contains initalizers, and core methods.
 */
export class GraphBase {

    // static variables
    // Constants
    static readonly sequenceFeatureGlyphWidth = 50;
    static readonly sequenceFeatureGlyphHeight = 100;
    static readonly interactionPortWidth = 10;

    static readonly molecularSpeciesGlyphWidth = 50;
    static readonly molecularSpeciesGlyphHeight = 50;

    static readonly defaultTextWidth = 120;
    static readonly defaultTextHeight = 80;

    static readonly defaultModuleWidth = 120;
    static readonly defaultModuleHeight = 50;

    static readonly defaultInteractionSize = 80;

    static readonly STYLE_CIRCUIT_CONTAINER = 'circuitContainer';
    static readonly STYLE_BACKBONE = 'backbone';
    static readonly STYLE_TEXTBOX = 'textBox';
    static readonly STYLE_MODULE = 'moduleGlyph';
    static readonly STYLE_SCAR = 'Scar (Assembly Scar)';
    static readonly STYLE_NGA = 'NGA (No Glyph Assigned)';
    static readonly STYLE_MOLECULAR_SPECIES = 'molecularSpeciesGlyph';
    static readonly STYLE_SEQUENCE_FEATURE = 'sequenceFeatureGlyph';
    static readonly STYLE_INTERACTION = 'interactionGlyph';
    static readonly STYLE_MODULE_VIEW = "moduleViewCell";
    static readonly STYLE_COMPONENT_VIEW = "componentViewCell";

    static readonly interactionControlName = 'Control';
    static readonly interactionInhibitionName = 'Inhibition';
    static readonly interactionStimulationName = 'Stimulation';
    static readonly interactionProcessName = 'Process';
    static readonly interactionDegradationName = 'Degradation';


    // class variables
    graph: mxGraph;
    editor: mxEditor;
    graphContainer: HTMLElement;

    // Keeps track of the cell order we entered
    viewStack: mxCell[];
    selectionStack: mxCell[];

    // Boolean for keeping track of whether we are showing scars or not in the graph.
    showingScars: boolean = true;

    baseMolecularSpeciesGlyphStyle: any;
    baseSequenceFeatureGlyphStyle: any;

    // This object handles the hotkeys for the graph.
    keyHandler: any;

    // when decoding we add any unformatted view cells to this set
    static unFormatedCells = new Set<string>();

    constructor(protected glyphService: GlyphService) {
        // constructor code is divided into helper methods for organization,
        // but these methods aren't entirely modular; order of some of
        // these calls is important
        this.initDecodeEnv();
        this.initExtraCellMethods();
        this.initGroupingRules();

        this.graphContainer = document.createElement('div');
        this.graphContainer.id = 'graphContainer';
        this.graphContainer.style.margin = 'auto';
        this.graphContainer.style.background = 'url(assets/grid.png)';
        this.graphContainer.style.position = 'absolute';
        this.graphContainer.style.top = '0';
        this.graphContainer.style.bottom = '0';
        this.graphContainer.style.left = '0';
        this.graphContainer.style.right = '0';
        this.graphContainer.style.overflow = 'hidden';

        // mxEditor is kind of a parent to mxGraph
        // it's used mainly for 'actions', which for now means delete, later will mean undoing
        this.editor = new mx.mxEditor();
        this.graph = this.editor.graph;
        // edges shouldn't find the nearest common ancestor
        this.graph.getModel().maintainEdgeParent = false;
        this.editor.setGraphContainer(this.graphContainer);

        this.graph.setCellsCloneable(false);
        this.graph.setConnectable(true);
        this.graph.setDisconnectOnMove(false);

        // Can't create edges without the glyph menu
        this.graph.connectionHandler.enabled = false;

        // Edges are allowed to be detached
        this.graph.setAllowDanglingEdges(true);

        // slightly clearer selection highlighting
        mx.mxConstants.VERTEX_SELECTION_STROKEWIDTH = 2;

        // Enables click-and-drag selection
        new mx.mxRubberband(this.graph);

        // This controls whether glyphs can be expanded without replacing the canvas
        this.graph.isCellFoldable = function (cell) {
            return false;
            // to enable, use 'return cell.isSequenceFeatureGlyph();'
        };

        this.initStyles();
        this.initCustomShapes();
        this.initListeners();
    }

    /**
     * Sets up environment variables to make decoding new graph models from xml into memory
     */
    initDecodeEnv() {
        // stuff needed for decoding
        window['mxGraphModel'] = mx.mxGraphModel;
        window['mxGeometry'] = mx.mxGeometry;
        window['mxPoint'] = mx.mxPoint;
        window['mxCell'] = mx.mxCell;

        let genericDecode = function (dec, node, into) {
            const meta = node;
            if (meta != null) {
                for (let i = 0; i < meta.attributes.length; i++) {
                    const attrib = meta.attributes[i];
                    if (attrib.specified == true && attrib.name != 'as') {
                        into[attrib.name] = attrib.value;
                    }
                }
                for (let i = 0; i < meta.children.length; i++) {
                    const childNode = meta.children[i];
                    into[childNode.getAttribute("as")] = dec.decode(childNode);
                }
            }
            return into;
        }

        //mxGraph uses function.name which uglifyJS breaks on production
        // Glyph info decode/encode
        Object.defineProperty(GlyphInfo, "name", { configurable: true, value: "GlyphInfo" });
        const glyphInfoCodec = new mx.mxObjectCodec(new GlyphInfo());
        glyphInfoCodec.decode = function (dec, node, into) {
            const glyphData = new GlyphInfo();
            return genericDecode(dec, node, glyphData);
        }
        glyphInfoCodec.encode = function (enc, object) {
            return object.encode(enc);
        }
        mx.mxCodecRegistry.register(glyphInfoCodec);
        window['GlyphInfo'] = GlyphInfo;

        // Module info encode/decode
        Object.defineProperty(ModuleInfo, "name", { configurable: true, value: "ModuleInfo" });
        const moduleInfoCodec = new mx.mxObjectCodec(new ModuleInfo());
        moduleInfoCodec.decode = function(dec, node, into){
            const moduleData = new ModuleInfo();
            return genericDecode(dec, node, moduleData);
        }
        moduleInfoCodec.encode = function(enc, object){
            return object.encode(enc);
        }
        mx.mxCodecRegistry.register(moduleInfoCodec);
        window['ModuleInfo'] = ModuleInfo;

        // Interaction info encode/decode
        Object.defineProperty(InteractionInfo, "name", { configurable: true, value: "InteractionInfo" });
        const interactionInfoCodec = new mx.mxObjectCodec(new InteractionInfo());
        interactionInfoCodec.decode = function (dec, node, into) {
            const interactionData = new InteractionInfo();
            return genericDecode(dec, node, interactionData);
        }
        interactionInfoCodec.encode = function (enc, object) {
            return object.encode(enc);
        }
        mx.mxCodecRegistry.register(interactionInfoCodec);
        window['InteractionInfo'] = InteractionInfo;

        Object.defineProperty(CanvasAnnotation, "name", { configurable: true, value: "CanvasAnnotation" });
        const canvasAnnotationCodec = new mx.mxObjectCodec(new CanvasAnnotation());
        canvasAnnotationCodec.decode = function (dec, node, into) {
            const canvasAnnotation = new CanvasAnnotation();
            return genericDecode(dec, node, canvasAnnotation);
        }
        canvasAnnotationCodec.encode = function (enc, object) {
            return object.encode(enc);
        }
        mx.mxCodecRegistry.register(canvasAnnotationCodec);
        window['CanvasAnnotation'] = CanvasAnnotation;

        // For circuitContainers, the order of the children matters.
        // We want it to match the order of the children's geometries
        const defaultDecodeCell = mx.mxCodec.prototype.decodeCell;
        mx.mxCodec.prototype.decodeCell = function (node, restoreStructures) {
            const cell = defaultDecodeCell.apply(this, arguments);

            // find cell 0 for the glyph dict
            let cell0 = cell;
            while (cell0.getId() != "0") {
                cell0 = cell0.parent;
            }
            let glyphDict = cell0.value;

            // check for format conditions
            if (((cell.isCircuitContainer() && cell.getParent().isModuleView()) || cell.isMolecularSpeciesGlyph() || cell.isModule()) && cell.getGeometry().height == 0) {
                GraphBase.unFormatedCells.add(cell.getParent().getId());
            }

            let reconstructCellStyle = false;
            if (cell && cell.id > 1 && !cell.isViewCell()) {
                if (!cell.style || cell.style.length == 0)
                    reconstructCellStyle = true;
                else if (cell.getGeometry().height == 0)
                    reconstructCellStyle = true;
                else if (cell.style.includes(GraphBase.STYLE_SEQUENCE_FEATURE) && !cell.style.includes(glyphDict[cell.value].partRole))
                    reconstructCellStyle = true;
                else if (cell.style === GraphBase.STYLE_MOLECULAR_SPECIES || cell.style.includes(GraphBase.STYLE_MOLECULAR_SPECIES + ";"))
                    reconstructCellStyle = true;
            }

            // reconstruct the cell style
            if (reconstructCellStyle) {
                if (glyphDict[cell.value] != null) {
                    if (glyphDict[cell.value].partType === 'DNA region') {
                        // sequence feature
                        if (!cell.style) {
                            cell.style = GraphBase.STYLE_SEQUENCE_FEATURE + glyphDict[cell.value].partRole;
                        } else {
                            cell.style = cell.style.replace(GraphBase.STYLE_SEQUENCE_FEATURE, GraphBase.STYLE_SEQUENCE_FEATURE + glyphDict[cell.value].partRole);
                        }
                        if (cell.geometry.width == 0)
                            cell.geometry.width = GraphBase.sequenceFeatureGlyphWidth;
                        if (cell.geometry.height == 0)
                            cell.geometry.height = GraphBase.sequenceFeatureGlyphHeight;
                    } else {
                        // molecular species
                        if (!cell.style)
                            cell.style = GraphBase.STYLE_MOLECULAR_SPECIES + "macromolecule";
                        else
                            cell.style = cell.style.replace(GraphBase.STYLE_MOLECULAR_SPECIES, GraphBase.STYLE_MOLECULAR_SPECIES + GraphBase.moleculeTypeToName(glyphDict[cell.value].partType))
                        cell.geometry.width = GraphBase.molecularSpeciesGlyphWidth;
                        cell.geometry.height = GraphBase.molecularSpeciesGlyphHeight;
                    }
                } else if (cell.value instanceof InteractionInfo) {
                    // interaction
                    let name = cell.value.interactionType;
                    if (name == "Biochemical Reaction" || name == "Non-Covalent Binding" || name == "Genetic Production") {
                        name = "Process";
                    }
                    if (!cell.style) {
                        cell.style = GraphBase.STYLE_INTERACTION + name;
                    } else {
                        cell.style = cell.style.replace(GraphBase.STYLE_INTERACTION, GraphBase.STYLE_INTERACTION + name);
                    }
                }
            }

            if (cell && cell.isSequenceFeatureGlyph()) {
                cell.parent.children.sort(function (cellA, cellB) {
                    return cellA.getGeometry().x - cellB.getGeometry().x;
                });
            }
            return cell;
        }
    }

    /**
     * Gives mxCells new methods related to our circuit/backbone rules
     */
    initExtraCellMethods() {

        mx.mxCell.prototype.isStyle = function (styleName) {
            if (!this.style)
                return false;
            return this.style.includes(styleName);
        };

        mx.mxCell.prototype.isBackbone = function () {
            return this.isStyle(GraphBase.STYLE_BACKBONE);
        };

        mx.mxCell.prototype.isMolecularSpeciesGlyph = function () {
            return this.isStyle(GraphBase.STYLE_MOLECULAR_SPECIES);
        };

        mx.mxCell.prototype.isCircuitContainer = function () {
            return this.isStyle(GraphBase.STYLE_CIRCUIT_CONTAINER);
        };

        mx.mxCell.prototype.isSequenceFeatureGlyph = function () {
            return this.isStyle(GraphBase.STYLE_SEQUENCE_FEATURE);
        };

        mx.mxCell.prototype.isScar = function () {
            return this.isStyle(GraphBase.STYLE_SCAR);
        };

        mx.mxCell.prototype.isInteraction = function () {
            return this.isStyle(GraphBase.STYLE_INTERACTION);
        }

        mx.mxCell.prototype.isModule = function () {
            return this.isStyle(GraphBase.STYLE_MODULE);
        }

        mx.mxCell.prototype.isViewCell = function () {
            return this.isStyle(GraphBase.STYLE_MODULE_VIEW) || this.isStyle(GraphBase.STYLE_COMPONENT_VIEW);
        }

        mx.mxCell.prototype.isModuleView = function () {
            return this.isStyle(GraphBase.STYLE_MODULE_VIEW);
        }

        mx.mxCell.prototype.isComponentView = function () {
            return this.isStyle(GraphBase.STYLE_COMPONENT_VIEW);
        }

        /**
         * Returns the id of the cell's highest ancestor
         * (or the cell's own id if it has no parent)
         */
        mx.mxCell.prototype.getContainerID = function () {
            if (this.isSequenceFeatureGlyph()) {
                return this.parent.getId();
            } else {
                return this.getId();
            }
        }

        /**
         * Returns the backbone associated with this cell
         */
        mx.mxCell.prototype.getBackbone = function () {
            if (this.isSequenceFeatureGlyph()) {
                return this.getCircuitContainer().getBackbone();
            } else if (this.isBackbone()) {
                return this;
            } else if (!this.isCircuitContainer()) {
                return null;
            }

            for (let i = 0; i < this.children.length; i++) {
                if (this.children[i].isBackbone()) {
                    return this.children[i]
                }
            }

            console.error("getBackbone(): No backbone found in circuit container!");
            return null;
        };

        mx.mxCell.prototype.getSequenceFeatureGlyph = function () {
            if (this.isSequenceFeatureGlyph()) {
                return this;
            }
            else if (this.isBackbone()) {
                return this.getParent().getSequenceFeatureGlyph();
            }
            else if (this.isCircuitContainer()) {
                if (this.getParent().isSequenceFeatureGlyph()) {
                    return this.getParent();
                } else {
                    // top level circuitContainers have no containing sequenceFeatureGlyph
                    return null;
                }
            }

            return null;
        };

        /**
         * Positions and sizes the backbone associated with this cell
         */
        mx.mxCell.prototype.refreshBackbone = function (graph) {
            if (this.isBackbone()) {
                this.getCircuitContainer(graph).refreshBackbone(graph);
                return;
            } else if (!this.isCircuitContainer()) {
                console.error("refreshBackbone: called on an invalid cell!");
                return;
            }
            // NOTE: 'this' is the circuitContainer, not the backbone
            // (for easier access to the list of glyphs)

            // width:
            let width = 0;
            for (let i = 0; i < this.children.length; i++) {
                if (this.children[i].isSequenceFeatureGlyph()) {
                    width += this.children[i].getGeometry().width;
                }
            }
            if (width < GraphBase.sequenceFeatureGlyphWidth) {
                width = GraphBase.sequenceFeatureGlyphWidth;
            }

            // Shape is a line, not rectangle, so any non-zero height is fine
            let height = 1;

            this.getBackbone().replaceGeometry('auto', GraphBase.sequenceFeatureGlyphHeight / 2, width, height, graph);
        };

        /**
         * (Re)positions the glyphs inside the circuitContainer and
         * also refreshes the backbone.
         */
        mx.mxCell.prototype.refreshCircuitContainer = function (graph) {
            if (!this.isCircuitContainer()) {
                console.error("refreshCircuitContainer: called on an invalid cell!");
                return;
            }

            // refresh backbone (width, height)
            this.refreshBackbone(graph);

            // verify own width, height
            this.replaceGeometry(
                'auto', 'auto', this.getBackbone().getGeometry().width, GraphBase.sequenceFeatureGlyphHeight, graph);

            // put the backbone first in the children array so it is drawn before glyphs
            // (meaning it appears behind them)
            if (!this.children[0].isBackbone())
                graph.getModel().add(this, this.getBackbone(), 0);

            // Layout all the glyphs in a horizontal line, while ignoring the backbone cell.
            const layout = new mx.mxStackLayout(graph, true);
            layout.resizeParent = true;
            layout.isVertexIgnored = function (vertex) {
                return vertex.isBackbone()
            };
            layout.execute(this);
        };

        mx.mxCell.prototype.refreshViewCell = function (graph) {
            if (!this.isViewCell()) {
                console.error("refreshViewCell: called on an invalid cell!");
                return;
            }

            // refresh all circuit containers
            if (this.children) {
                for (let child of this.children) {
                    if (child.isCircuitContainer()) {
                        child.refreshCircuitContainer(graph);
                    }
                }
            }
        };

        /**
         * Returns the circuit container associated with this cell.
         */
        mx.mxCell.prototype.getCircuitContainer = function (graph) {
            if (this.isSequenceFeatureGlyph()) {
                const children = graph.getModel().getCell(this.value).children;
                for (let child of children) {
                    if (child.isCircuitContainer()) {
                        return child;
                    }
                }
            } else if (this.isCircuitContainer()) {
                return this;
            } else if (this.isBackbone()) {
                return this.getParent();
            }

            return null;
        };

        /**
         * Replaces this cell's geometry in an undo friendly way
         * 'graph' must be a reference to the graph
         *
         * For any other value, pass the string 'auto' to use the
         * previous geometry's value.
         *
         * It is not necessary to wrap this in (begin/end)Update() calls.
         */
        mx.mxCell.prototype.replaceGeometry = function (x, y, width, height, graph) {
            const oldGeo = this.getGeometry();
            const newGeo = new mx.mxGeometry(oldGeo.x, oldGeo.y, oldGeo.width, oldGeo.height);

            if (x !== 'auto') {
                newGeo.x = x;
            }
            if (y !== 'auto') {
                newGeo.y = y;
            }
            if (width !== 'auto') {
                newGeo.width = width;
            }
            if (height !== 'auto') {
                newGeo.height = height;
            }

            // to save entries on undo stack, don't call setGeometry unless necessary
            if (oldGeo.x === newGeo.x && oldGeo.y === newGeo.y
                && oldGeo.width === newGeo.width && oldGeo.height === newGeo.height) {
                return;
            }

            graph.getModel().setGeometry(this, newGeo);
        };
    }

    /**
     * Sets up rules for circuits' grouping/selection behavior
     */
    initGroupingRules() {
        // Cells can be moved outside their parent's bounding box without being disowned
        mx.mxGraphHandler.prototype.setRemoveCellsFromParent(false);
        mx.mxGraph.prototype.setConstrainChildren(false);

        /**
         * Never act as though the backbone cell was clicked.
         * If it was, act like the circuitContainer was clicked instead.
         */
        const defaultGetInitialCellForEvent = mx.mxGraphHandler.prototype.getInitialCellForEvent;
        mx.mxGraphHandler.prototype.getInitialCellForEvent = function (me) {
            let cell = defaultGetInitialCellForEvent.apply(this, arguments);
            if (cell.isBackbone()) {
                cell = cell.getCircuitContainer();
            }
            return cell;
        }

        /**
         * For some reason, the above method doesn't work with alt-clicking.
         * This method covers that case.
         */
        const defaultSelectCellForEvent = mx.mxGraph.prototype.selectCellForEvent;
        mx.mxGraph.prototype.selectCellForEvent = function (cell, evt) {
            if (cell.isBackbone())
                cell = cell.getParent();

            defaultSelectCellForEvent.apply(this, [cell, evt]);
        };

        /**
         * Some methods of selecting cells don't involve clicking directly
         * on the cell at all (for example rubberband selection).
         * This to guarantees the backbone can never be selected, no matter what.
         *
         * (The previous two methods are still necessary, or clicking on the
         * backbone would select nothing, instead of passing the click
         * event up to the circuitContainer.)
         */
        mx.mxGraph.prototype.isCellSelectable = function (cell) {
            return !cell.isBackbone();
        }
    }

    /**
     * Sets up all the constant styles used by the graph.
     *
     * Can only be called before this.graph is initialized
     */
    initStyles() {

        // Main glyph settings. These are applied to sequence feature glyphs and molecular species glyphs
        this.baseMolecularSpeciesGlyphStyle = {};
        this.baseMolecularSpeciesGlyphStyle[mx.mxConstants.STYLE_FILLCOLOR] = '#ffffff';
        this.baseMolecularSpeciesGlyphStyle[mx.mxConstants.STYLE_STROKECOLOR] = '#000000';
        this.baseMolecularSpeciesGlyphStyle[mx.mxConstants.STYLE_NOLABEL] = false;
        this.baseMolecularSpeciesGlyphStyle[mx.mxConstants.STYLE_VERTICAL_ALIGN] = 'top';
        this.baseMolecularSpeciesGlyphStyle[mx.mxConstants.STYLE_VERTICAL_LABEL_POSITION] = 'bottom';
        this.baseMolecularSpeciesGlyphStyle[mx.mxConstants.STYLE_EDITABLE] = false;
        this.baseMolecularSpeciesGlyphStyle[mx.mxConstants.STYLE_RESIZABLE] = 0;
        this.baseMolecularSpeciesGlyphStyle[mx.mxConstants.STYLE_DIRECTION] = "east";
        this.baseMolecularSpeciesGlyphStyle[mx.mxConstants.STYLE_STROKEWIDTH] = 2;
        this.baseMolecularSpeciesGlyphStyle[mx.mxConstants.STYLE_FONTCOLOR] = '#000000';
        this.baseMolecularSpeciesGlyphStyle[mx.mxConstants.STYLE_FONTSIZE] = 14;
        //this.baseGlyphStyle[mx.mxConstants.DEFAULT_HOTSPOT] = 0;

        // Sequence features need almost the same styling as molecularSpecies
        this.baseSequenceFeatureGlyphStyle = mx.mxUtils.clone(this.baseMolecularSpeciesGlyphStyle);
        this.baseSequenceFeatureGlyphStyle[mx.mxConstants.STYLE_PORT_CONSTRAINT] = [mx.mxConstants.DIRECTION_NORTH, mx.mxConstants.DIRECTION_SOUTH];


        const textBoxStyle = {};
        textBoxStyle[mx.mxConstants.STYLE_SHAPE] = mx.mxConstants.SHAPE_LABEL;
        textBoxStyle[mx.mxConstants.STYLE_FILLCOLOR] = '#ffffff';
        textBoxStyle[mx.mxConstants.STYLE_STROKECOLOR] = '#000000';
        textBoxStyle[mx.mxConstants.STYLE_FONTCOLOR] = '#000000';
        this.graph.getStylesheet().putCellStyle(GraphBase.STYLE_TEXTBOX, textBoxStyle);

        const moduleStyle = {};
        moduleStyle[mx.mxConstants.STYLE_SHAPE] = mx.mxConstants.SHAPE_RECTANGLE;
        moduleStyle[mx.mxConstants.STYLE_FILLCOLOR] = '#ffffff';
        moduleStyle[mx.mxConstants.STYLE_STROKECOLOR] = '#000000';
        moduleStyle[mx.mxConstants.STYLE_FONTCOLOR] = '#000000';
        moduleStyle[mx.mxConstants.STYLE_STROKEWIDTH] = 2;
        moduleStyle[mx.mxConstants.STYLE_EDITABLE] = false;
        moduleStyle[mx.mxConstants.STYLE_ROUNDED] = true;
        this.graph.getStylesheet().putCellStyle(GraphBase.STYLE_MODULE, moduleStyle);

        const circuitContainerStyle = {};
        circuitContainerStyle[mx.mxConstants.STYLE_SHAPE] = mx.mxConstants.SHAPE_RECTANGLE;
        circuitContainerStyle[mx.mxConstants.STYLE_STROKECOLOR] = 'none';
        circuitContainerStyle[mx.mxConstants.STYLE_FILLCOLOR] = 'none';
        circuitContainerStyle[mx.mxConstants.STYLE_RESIZABLE] = 0;
        circuitContainerStyle[mx.mxConstants.STYLE_EDITABLE] = false;
        circuitContainerStyle[mx.mxConstants.STYLE_PORT_CONSTRAINT] = [mx.mxConstants.DIRECTION_NORTH, mx.mxConstants.DIRECTION_SOUTH];
        this.graph.getStylesheet().putCellStyle(GraphBase.STYLE_CIRCUIT_CONTAINER, circuitContainerStyle);

        const backboneStyle = {};
        backboneStyle[mx.mxConstants.STYLE_SHAPE] = mx.mxConstants.SHAPE_LINE;
        backboneStyle[mx.mxConstants.STYLE_STROKECOLOR] = '#000000';
        backboneStyle[mx.mxConstants.STYLE_STROKEWIDTH] = 2;
        backboneStyle[mx.mxConstants.STYLE_RESIZABLE] = 0;
        backboneStyle[mx.mxConstants.STYLE_EDITABLE] = false;
        this.graph.getStylesheet().putCellStyle(GraphBase.STYLE_BACKBONE, backboneStyle);

        // Interaction styles
        const baseInteractionGlyphStyle = {};
        baseInteractionGlyphStyle[mx.mxConstants.STYLE_STROKEWIDTH] = 2;
        baseInteractionGlyphStyle[mx.mxConstants.STYLE_ENDSIZE] = 10;
        baseInteractionGlyphStyle[mx.mxConstants.STYLE_STROKECOLOR] = '#000000';
        baseInteractionGlyphStyle[mx.mxConstants.STYLE_FILLCOLOR] = '#000000';
        baseInteractionGlyphStyle[mx.mxConstants.STYLE_EDITABLE] = false;
        baseInteractionGlyphStyle[mx.mxConstants.STYLE_EDGE] = mx.mxConstants.EDGESTYLE_ORTHOGONAL;
        baseInteractionGlyphStyle[mx.mxConstants.STYLE_ENDFILL] = 0;

        const interactionControlStyle = mx.mxUtils.clone(baseInteractionGlyphStyle); // Inherit from the interaction defaults.
        interactionControlStyle[mx.mxConstants.STYLE_ENDARROW] = mx.mxConstants.ARROW_DIAMOND;
        this.graph.getStylesheet().putCellStyle(GraphBase.STYLE_INTERACTION + GraphBase.interactionControlName, interactionControlStyle);

        const interactionInhibitionStyle = mx.mxUtils.clone(baseInteractionGlyphStyle);
        interactionInhibitionStyle[mx.mxConstants.STYLE_ENDARROW] = GraphBase.interactionInhibitionName;
        interactionInhibitionStyle[mx.mxConstants.STYLE_ENDSIZE] = 15;
        this.graph.getStylesheet().putCellStyle(GraphBase.STYLE_INTERACTION + GraphBase.interactionInhibitionName, interactionInhibitionStyle);

        const interactionStimulationStyle = mx.mxUtils.clone(baseInteractionGlyphStyle);
        interactionStimulationStyle[mx.mxConstants.STYLE_ENDARROW] = mx.mxConstants.ARROW_BLOCK;
        this.graph.getStylesheet().putCellStyle(GraphBase.STYLE_INTERACTION + GraphBase.interactionStimulationName, interactionStimulationStyle);

        const interactionProcessStyle = mx.mxUtils.clone(baseInteractionGlyphStyle);
        interactionProcessStyle[mx.mxConstants.STYLE_ENDARROW] = mx.mxConstants.ARROW_BLOCK;
        interactionProcessStyle[mx.mxConstants.STYLE_ENDFILL] = 1;
        this.graph.getStylesheet().putCellStyle(GraphBase.STYLE_INTERACTION + GraphBase.interactionProcessName, interactionProcessStyle);

        const interactionDegradationStyle = mx.mxUtils.clone(baseInteractionGlyphStyle);
        interactionDegradationStyle[mx.mxConstants.STYLE_ENDARROW] = GraphBase.interactionDegradationName;
        interactionDegradationStyle[mx.mxConstants.STYLE_ENDSIZE] = 20;
        this.graph.getStylesheet().putCellStyle(GraphBase.STYLE_INTERACTION + GraphBase.interactionDegradationName, interactionDegradationStyle);
    }

    /**
     * Loads glyph stencils and their names from the glyphService, and
     * saves them to mxGraph's shape registry
     */
    initCustomShapes() {

        let stencils = this.glyphService.getSequenceFeatureGlyphs();

        for (const name in stencils) {
            // Create a new copy of the stencil for the graph.
            const stencil = stencils[name][0];
            const centered = stencils[name][1];
            let customStencil = new mx.mxStencil(stencil.desc); // Makes a deep copy

            // Change the copied stencil for mxgraph
            let origDrawShape = mx.mxStencil.prototype.drawShape;

            if (centered) {
                customStencil.drawShape = function (canvas, shape, x, y, w, h) {
                    h /= 2;
                    y += h / 2;
                    origDrawShape.apply(this, [canvas, shape, x, y, w, h]);
                }
            } else {
                customStencil.drawShape = function (canvas, shape, x, y, w, h) {
                    h = h / 2;
                    origDrawShape.apply(this, [canvas, shape, x, y, w, h]);
                }
            }

            // Add the stencil to the registry and set its style.
            mx.mxStencilRegistry.addStencil(name, customStencil);

            const newGlyphStyle = mx.mxUtils.clone(this.baseSequenceFeatureGlyphStyle);
            newGlyphStyle[mx.mxConstants.STYLE_SHAPE] = name;
            this.graph.getStylesheet().putCellStyle(GraphBase.STYLE_SEQUENCE_FEATURE + name, newGlyphStyle);
        }

        // molecularSpecies glyphs are simpler, since we don't have to morph
        // them to always be centred on the strand
        stencils = this.glyphService.getMolecularSpeciesGlyphs();
        for (const name in stencils) {
            const stencil = stencils[name][0];
            let customStencil = new mx.mxStencil(stencil.desc); // Makes of deep copy of the stencil.
            mx.mxStencilRegistry.addStencil(name, customStencil);

            const newGlyphStyle = mx.mxUtils.clone(this.baseMolecularSpeciesGlyphStyle);
            newGlyphStyle[mx.mxConstants.STYLE_SHAPE] = name;
            this.graph.getStylesheet().putCellStyle(GraphBase.STYLE_MOLECULAR_SPECIES + name, newGlyphStyle);
        }

        // *** Define custom markers for edge endpoints ***

        /**
         * Returns a function that draws an Inhibition glyph
         * @param endPoint The connection's endpoint (ie the coordinate of the anchor it's attached to)
         * @param unitX The x part of a vector specifying the connection's direction
         * @param unitY The y part of a vector specifying the connection's direction
         * @param size The size of the connection head, directly from the connection's style
         * @param source Boolean, true if this is the source endpoint, false if it is the terminal endpoint
         * @param sw The stroke width
         * @param filled Boolean, false if the connection head should have any transparency in the middle, true otherwise
         */
        let inhibitionMarkerDrawFunction = function (canvas, shape, type, endPoint, unitX, unitY, size, source, sw, filled) {
            return function () {
                canvas.begin();
                canvas.moveTo(endPoint.x + (unitY * (size + sw) / 2), endPoint.y - (unitX * (size + sw) / 2));
                canvas.lineTo(endPoint.x - (unitY * (size + sw) / 2), endPoint.y + (unitX * (size + sw) / 2));
                canvas.stroke();
            };
        };
        mx.mxMarker.addMarker(GraphBase.interactionInhibitionName, inhibitionMarkerDrawFunction);

        /**
         * Returns a function that draws a Process glyph
         */
        let degradationMarkerDrawFunction = function (canvas, shape, type, endPoint, unitX, unitY, size, source, sw, filled) {
            const triangleTipX = endPoint.x - (unitX * (size + sw) / 2);
            const triangleTipY = endPoint.y - (unitY * (size + sw) / 2);

            const circleCenterX = endPoint.x - (unitX * size / 4);
            const circleCenterY = endPoint.y - (unitY * size / 4);

            const root2over2 = Math.sin(Math.PI / 4);

            // Changing the parameter controls how far the connection's stem is drawn
            endPoint.x = triangleTipX;
            endPoint.y = triangleTipY;

            return function () {

                // CIRCLE
                canvas.ellipse(circleCenterX - size / 4, circleCenterY - size / 4, size / 2, size / 2);
                canvas.stroke();

                // TRIANGLE
                canvas.begin();
                canvas.moveTo(triangleTipX, triangleTipY);
                canvas.lineTo(triangleTipX - (unitY * size / 4) - (unitX * size / 2), triangleTipY + (unitX * size / 4) - (unitY * size / 2));
                canvas.lineTo(triangleTipX + (unitY * size / 4) - (unitX * size / 2), triangleTipY - (unitX * size / 4) - (unitY * size / 2));
                canvas.close();
                canvas.fillAndStroke();

                // SLASH (line through the circle)
                canvas.begin();
                canvas.moveTo(circleCenterX + root2over2 * size / 4, circleCenterY - root2over2 * size / 4);
                canvas.lineTo(circleCenterX - root2over2 * size / 4, circleCenterY + root2over2 * size / 4);
                canvas.stroke();
                // This code makes the line rotate, but it makes more sense to always slash the same way
                // canvas.moveTo(circleCenterX + (unitY * root2over2 * size / 4) + (unitX * root2over2 * size / 4),
                //   circleCenterY - (unitX * root2over2 * size / 4) + (unitY * root2over2 * size / 4));
                // canvas.lineTo(circleCenterX - (unitX * root2over2 * size / 4) - (unitY * root2over2 * size / 4),
                //   circleCenterY + (unitX * root2over2 * size / 4) - (unitY * root2over2 * size / 4));
            };
        };
        mx.mxMarker.addMarker(GraphBase.interactionDegradationName, degradationMarkerDrawFunction);
    }

    /**
     * Sets up logic for handling sequenceFeatureGlyph movement
     */
    initListeners() {
        // edge movement
        this.graph.addListener(mx.mxEvent.CONNECT_CELL, mx.mxUtils.bind(this, async function(sender, evt){

            // if the terminal is a module, we need to prompt what it should be changed to, otherwise just clear it

            let edge = evt.getProperty("edge");
            let terminal = evt.getProperty("terminal");
            let source = evt.getProperty("source");

            let cancelled = false;

            try{
                sender.getModel().beginUpdate();
                let newTarget = null;
                if(terminal != null && terminal.isModule()){
                    newTarget = await this.promptChooseFunctionalComponent(terminal, source);
                    if(!newTarget){
                        cancelled = true;
                        return;
                    }
                }

                let infoCopy = edge.value.makeCopy();

                if(source){
                    infoCopy.fromURI = newTarget;
                }else{
                    infoCopy.toURI = newTarget;
                }

                sender.getModel().execute(new GraphEdits.interactionEdit(edge, infoCopy));
            }finally{
                sender.getModel().endUpdate();
                // undo has to happen after end update
                if (cancelled) {
                    this.editor.undoManager.undo();
                    this.editor.undoManager.trim();
                }
            }
            evt.consume();
        }));

        // cell movement
        this.graph.addListener(mx.mxEvent.MOVE_CELLS, mx.mxUtils.bind(this, async function (sender, evt) {
            // sender is the graph

            sender.getModel().beginUpdate();
            let cancelled = false;
            try {
                let movedCells = evt.getProperty("cells");
                // important note: if a parent cell is moving, none of its children
                // can appear here (even if they were also selected)

                // sort cells: processing order is important
                movedCells = movedCells.sort(function (cellA, cellB) {
                    if (cellA.getContainerID() !== cellB.getContainerID()) {
                        // cells are not related: choose arbitrary order (but still group by root)
                        return cellA.getContainerID() < cellB.getContainerID() ? -1 : 1;
                    } else {
                        // If the two cells are sequence feature glyphs AND they are on the same strand.
                        // ... must be in sequence order
                        // As a result of these facts, referencing 'parent' here is safe.
                        let aIndex = cellA.getParent().getIndex(cellA);
                        let bIndex = cellB.getParent().getIndex(cellB);

                        return aIndex - bIndex;
                    }
                });

                // ownership change check
                let containers = new Set<string>();
                if (sender.getCurrentRoot()) {
                    let ownershipChange = false;
                    for (let cell of movedCells) {
                        if (cell.isSequenceFeatureGlyph()) {
                            ownershipChange = true;
                            containers.add(cell.getParent().getValue());
                        }
                    }
                    for (let container of Array.from(containers.values())) {
                        let glyphInfo;
                        if (sender.getCurrentRoot().isComponentView()) {
                            glyphInfo = this.getFromInfoDict(sender.getCurrentRoot().getId());
                        } else {
                            glyphInfo = this.getFromInfoDict(container);
                        }
                        if (ownershipChange && glyphInfo.uriPrefix != environment.baseURI && !await this.promptMakeEditableCopy(glyphInfo.displayID)) {
                            cancelled = true;
                            // go check the finally block because I couldn't undo until after the end update
                            return;
                        }
                    }
                }

                let fell_into_vat_of_radio_active_sludge = true;
                let firstContainerID = movedCells[0].getContainerID();
                for (let i = 0; i < movedCells.length; i++) {
                  if (movedCells[i].getContainerID() !== firstContainerID || !movedCells[i].isSequenceFeatureGlyph()) {
                    fell_into_vat_of_radio_active_sludge = false;
                    break;
                  }
                  // We know that the movedCells[i] is a sequence feature glyph at this point.
                  let circuitContainerGeom = movedCells[i].getParent().getGeometry()
                  let movedCellGeom = movedCells[i].getGeometry()
                  // We need to adjust the x and y coors of the moved cell because it is child of the circuit container
                  // and thus has relative coordinates. By adding the absolute coords of the circuit containter, we have
                  // the correct coordinates for both boxes.
                  let movedCellGeomCopy = new mx.mxGeometry(movedCellGeom.x + circuitContainerGeom.x, movedCellGeom.y + circuitContainerGeom.y, movedCellGeom.width, movedCellGeom.height)
                  if (this.cellsAreOverlapping(circuitContainerGeom, movedCellGeomCopy, 30)) {
                    fell_into_vat_of_radio_active_sludge = false;
                    break;
                  }
                }

                if (fell_into_vat_of_radio_active_sludge) {
                  // TODO: Handle edges (and other edge cases)
                  let x = movedCells[0].getParent().getGeometry().x + movedCells[0].getGeometry().x;
                  let y = movedCells[0].getParent().getGeometry().y + movedCells[0].getGeometry().y;
                  sender.removeCells(movedCells)
                  let circuitContainer = this.addBackboneAt(x, y)
                  sender.addCells(movedCells, circuitContainer);
                }

                // If two adjacent sequenceFeatureGlyphs were moved, they should be adjacent after the move.
                // This loop finds all such sets of glyphs (relying on the sorted order) and sets them to
                // have the same x position so there is no chance of outside glyphs sneaking in between
                let streak;
                for (let i = 0; i < movedCells.length; i += streak) {
                    streak = 1;
                    if (!movedCells[i].isSequenceFeatureGlyph()) {
                        continue;
                    }
                    // found a sequenceFeature glyph. A streak might be starting...
                    const baseX = movedCells[i].getGeometry().x;
                    const rootId = movedCells[i].getContainerID();
                    let streakWidth = movedCells[i].getGeometry().width;

                    while (i + streak < movedCells.length
                        && movedCells[i + streak].isSequenceFeatureGlyph()
                        && rootId === movedCells[i + streak].getContainerID()) {
                        let xToContinueStreak = baseX + streakWidth;
                        if (xToContinueStreak === movedCells[i + streak].getGeometry().x) {
                            // The next cell continues the streak
                            movedCells[i + streak].replaceGeometry(baseX, 'auto', 'auto', 'auto', sender);

                            streakWidth += movedCells[i + streak].getGeometry().width;
                            streak++;
                        } else {
                            // the next cell breaks the streak
                            break;
                        }
                    }
                }

                // now all sequence feature glyphs are sorted by x position in the order
                // they should be when the move finishes.
                // (equal x position means they should stay in the order they were previously in)
                let cells = sender.getChildVertices(sender.getDefaultParent());
                for (let circuitContainer of cells.filter(cell => cell.isCircuitContainer())) {
                    this.horizontalSortBasedOnPosition(circuitContainer);
                }

                // finallly, another special case: if a circuitContainer only has one sequenceFeatureGlyph,
                // moving the glyph should move the circuitContainer
                if (!fell_into_vat_of_radio_active_sludge) {
                  for (const cell of movedCells) {
                    if (cell.isSequenceFeatureGlyph() && cell.getParent().children.length === 2) {
                      const x = cell.getParent().getGeometry().x + evt.getProperty("dx");
                      const y = cell.getParent().getGeometry().y + evt.getProperty("dy");
                      cell.getParent().replaceGeometry(x, y, 'auto', 'auto', sender);
                    }
                  }
                }

                // sync circuit containers
                let circuitContainers = new Set<mxCell>();
                for (let movedCell of movedCells) {
                    if (movedCell.isSequenceFeatureGlyph()) {
                        circuitContainers.add(movedCell.getParent());
                    }
                }
                for (let circuitContainer of Array.from(circuitContainers.values())) {
                    this.syncCircuitContainer(circuitContainer);
                }

                // change ownership
                for (let container of Array.from(containers)) {
                    this.changeOwnership(container);
                }

                evt.consume();
            } finally {
                sender.getModel().endUpdate();
                // undo has to happen after end update
                if (cancelled) {
                    this.editor.undoManager.undo();
                    this.editor.undoManager.trim();
                }
            }
        }));
    }

    protected moleculeNameToType(name: string) {
        switch (name) {
            case "dsNA":
                return "DNA molecule";
            case "macromolecule":
                return "Protein";
            case "NGA (No Glyph Assigned Molecular Species)":
                return "Protein";
            case "small-molecule":
                return "Small molecule";
            case "ssNA":
                return "RNA molecule";
            case "replacement-glyph":
                return "All_types";
            default:
                return "Protein";
        }
    }

    static moleculeTypeToName(type: string) {
        switch (type) {
            case "DNA molecule":
                return "dsNA";
            case "Protein":
                return "macromolecule";
            case "Protein":
                return "NGA (No Glyph Assigned Molecular Species)";
            case "Small molecule":
                return "small-molecule";
            case "RNA molecule":
                return "ssNA";
            case "All_types":
                return "replacement-glyph";
            default:
                return "NGA (No Glyph Assigned Molecular Species)";
        }
    }

}
