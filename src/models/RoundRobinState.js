const mongoose = require("mongoose");

const roundRobinStateSchema = new mongoose.Schema(
  {
    store_code: { type: String, required: true },
    project_code: { type: String, required: true },
    last_assigned_picker_index: { type: Number, default: -1 },
    picker_queue: [{ type: mongoose.Schema.Types.ObjectId, ref: "PickerUser" }],
    updated_at: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

roundRobinStateSchema.index({ store_code: 1, project_code: 1 }, { unique: true });

module.exports = mongoose.model("RoundRobinState", roundRobinStateSchema, "round_robin_state");
