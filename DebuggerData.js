import * as helios from "./helios.js";
import {assert} from "./util.js";
import {FileData} from "./FileData.js";
import {FileViewerData} from "./FileViewerData.js";
import {TextViewer} from "./TextViewer.js";

const DebuggerStatus = {
    Idle: 0,
    Running: 1,
	Stepping: 2,
};

export class DebuggerData extends FileViewerData {
    constructor(db, files, active, error, ir, program, status, console, stack, waiter) {
        super(db, files, active);
        
        this.error_   = error; // compilation errors come here
        this.ir_      = ir;
        this.program_ = program;
        this.status_  = status;
        this.console_ = console;
		assert(stack instanceof Array);
        this.stack_   = stack;
		this.waiter_  = waiter;
    }

    static new(db) {
        return new DebuggerData(
            db, 
            new Map(), 
            null, 
            null, 
            null, 
            null, 
            DebuggerStatus.Idle, 
            [], 
            [],
			null,
        );
    }

    get error() {
        return this.error_;
    }

    get ir() {
        return this.ir_;
    }

    get program() {
        return this.program_;
    }

	get isIdle() {
		return this.status_ == DebuggerStatus.Idle;
	}

    get isRunning() {
        return this.status_ == DebuggerStatus.Running;
    }

	get isStepping() {
		return this.status_ == DebuggerStatus.Stepping;
	}

    get console() {
        return this.console_.slice();
    }

    get stack() {
        return this.stack_.slice();
    }

	get waiter() {
		return this.waiter_;
	}

    isSynced(dbFiles) {
        if (!super.isSynced(dbFiles)) {
            return false;
        } else {
            for (let [key, fileData] of this.files_) {
                if (fileData.raw != dbFiles.get(key).data) {
                    return false;
                }
            }

            return true;
        }
    }

    sync(dbFiles) {
        let newFiles = new Map();

        // next open files that aren't yet opened
        for (let [key, file] of dbFiles) {
            if (!this.files_.has(key)) {
                newFiles.set(key, FileData.new(file.data));
            }
        }

        if (!newFiles.has(this.active_)) {
            return new DebuggerData(
                this.db_, 
                newFiles, 
                null, 
                null, 
                null,
                null,
                DebuggerStatus.Idle,
                [],
                [],
				null,
            );
        } else {
            return new DebuggerData(
                this.db_, 
                newFiles, 
                this.active_, 
                this.error_, 
                this.ir_,
                this.program_,
                this.status_,
                this.console_,
                this.stack_,
				this.waiter_,
            );
        }
    }

    setActive(key) {
        if (key == this.active_) {
            return this;
        } else if (!this.files_.has(key)) {
            return new DebuggerData(
                this.db_, 
                this.files_, 
                null, 
                null, 
                null,
                null,
                DebuggerStatus.Idle,
                [],
                [],
				null,
            );
        } else {
            // compile the program
            let fileData = this.files_.get(key);
            
            try {
                let program = helios.compile(fileData.raw, {stage: helios.CompilationStage.PlutusCore});
                let irSrc = program.src;

                return new DebuggerData(
                    this.db_, 
                    this.files_, 
                    key, 
                    null, 
                    FileData.new(irSrc),
                    program,
                    DebuggerStatus.Idle,
                    [],
                    [],
					null,
                );
            } catch(e) {
                if (!(e instanceof helios.UserError)) {
                    throw e;
                }

                let fileData = TextViewer.scrollErrorToCenter(fileData, this.e, "error-debugger-sizer");

                return (new DebuggerData(
                    this.db_, 
                    this.files_, 
                    key, 
                    e, 
                    null,
                    null,
                    DebuggerStatus.Idle,
                    [],
                    [],
					null,
                )).setActiveFileData(fileData);
            }
        }
    }

    // only used for positions
    setActiveFileData(fileData) {
        let that = super.setActiveFileData(fileData);

        return new DebuggerData(
            that.db_,
            that.files_,
            that.active_,
            this.error_,
            this.ir_,
            this.program_,
            this.status_,
            this.console_,
            this.stack_,
			this.waiter_,
        );
    }

    setActiveIRData(irData) {
        return new DebuggerData(
            this.db_,
            this.files_,
            this.active_,
            this.error_,
            irData,
            this.program_,
            this.status_,
            this.console_,
            this.stack_,
			this.waiter_,
        );
    }

    startRun() {
        return new DebuggerData(
            this.db_,
            this.files_,
            this.active_,
            this.error_,
            this.ir_,
            this.program_,
            DebuggerStatus.Running,
            [], // clear console and stack
            [],
			null,
        );
    }

	startStep() {
        return new DebuggerData(
            this.db_,
            this.files_,
            this.active_,
            this.error_,
            this.ir_,
            this.program_,
            DebuggerStatus.Stepping,
            [], // clear console and stack
            [],
			null,
        );
	}

    setIdle() {
        return new DebuggerData(
            this.db_,
            this.files_,
            this.active_,
            this.error_,
            this.ir_,
            this.program_,
            DebuggerStatus.Idle,
            this.console_,
            this.stack_,
			null,
        );
    }

    addConsoleMessage(msg) {
        let console = this.console;
        console.push(msg);

        return new DebuggerData(
            this.db_,
            this.files_,
            this.active_,
            this.error_,
            this.ir_,
            this.program_,
            this.status_,
            console,
            this.stack_,
			this.waiter_,
        );
    }

    // input pair: [name, helios.PlutusCoreValue]
    setStack(pairs) {
        return new DebuggerData(
            this.db_,
            this.files_,
            this.active_,
            this.error_,
            this.ir_,
            this.program_,
            this.status_,
            this.console_,
            pairs,
			this.waiter_,
        );
    }

	setWaiter(site, waiter) {
        let [x, y] = site.getFilePos();

        console.log("moving caret to", x, y);
        let irData = this.ir_.moveCaretTo(x, y);
        irData = TextViewer.scrollCaretToCenter(irData, "ir-debugger-sizer");

		// TODO: use the site
		return new DebuggerData(
			this.db_,
			this.files_,
			this.active_,
			this.error_,
			irData,
			this.program_,
			this.status_,
			this.console_,
			this.stack_,
			waiter,
		);
	}
}
