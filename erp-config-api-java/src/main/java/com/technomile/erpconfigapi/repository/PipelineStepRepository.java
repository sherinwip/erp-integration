package com.technomile.erpconfigapi.repository;

import com.technomile.erpconfigapi.entity.PipelineStep;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PipelineStepRepository extends JpaRepository<PipelineStep, Long> {
    List<PipelineStep> findByPipelineIdOrderBySeqAsc(String pipelineId);
    Optional<PipelineStep> findByPipelineIdAndStepPk(String pipelineId, Long stepPk);
    Optional<PipelineStep> findByPipelineIdAndSeq(String pipelineId, Integer seq);
}
