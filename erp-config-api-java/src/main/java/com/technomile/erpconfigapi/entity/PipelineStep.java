package com.technomile.erpconfigapi.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "pipeline_step", uniqueConstraints = {
        @UniqueConstraint(name = "uq_pipeline_step_pipeline_step", columnNames = {"pipeline_id", "step_pk"}),
        @UniqueConstraint(name = "uq_pipeline_step_pipeline_seq", columnNames = {"pipeline_id", "seq"})
})
public class PipelineStep {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "pipeline_step_pk")
    private Long pipelineStepPk;

    @Column(name = "pipeline_id", nullable = false, length = 100)
    private String pipelineId;

    @Column(name = "step_pk", nullable = false)
    private Long stepPk;

    @Column(name = "seq", nullable = false)
    private Integer seq;

    public Long getPipelineStepPk() { return pipelineStepPk; }
    public void setPipelineStepPk(Long pipelineStepPk) { this.pipelineStepPk = pipelineStepPk; }
    public String getPipelineId() { return pipelineId; }
    public void setPipelineId(String pipelineId) { this.pipelineId = pipelineId; }
    public Long getStepPk() { return stepPk; }
    public void setStepPk(Long stepPk) { this.stepPk = stepPk; }
    public Integer getSeq() { return seq; }
    public void setSeq(Integer seq) { this.seq = seq; }
}
